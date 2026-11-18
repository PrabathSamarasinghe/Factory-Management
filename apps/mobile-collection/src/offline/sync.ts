import { pullSync, pushPickups } from '../api/client';
import {
  applyPull,
  getServerTime,
  getSyncPullCursor,
  listOutbox,
  removeOutboxItems,
  updateOutboxItem,
} from '../storage/encryptedStore';
import type { OutboxItem, SyncPullResult } from '../types';
import { nextBackoffMs, safeSentAt } from '../utils/clock';

const BATCH_SIZE = 200;

export interface SyncResult {
  sent: number;
  duplicates: number;
  failed: number;
  remaining: number;
  pulled: number;
  cursor: string | null;
}

function isDuplicate(error: { code: string; message: string }): boolean {
  const code = (error.code ?? '').toUpperCase();
  const message = (error.message ?? '').toLowerCase();
  return (
    code.includes('CONFLICT') ||
    code.includes('DUPLICATE') ||
    message.includes('duplicate') ||
    message.includes('already exists') ||
    message.includes('idempotent')
  );
}

function retryPatch(item: OutboxItem, message: string, now = Date.now()) {
  const attempts = item.attempts + 1;
  return {
    attempts,
    lastError: message,
    nextAttemptAt: new Date(now + nextBackoffMs(attempts)).toISOString(),
  };
}

async function markRetryable(items: OutboxItem[], message: string): Promise<void> {
  const now = Date.now();
  for (const item of items) {
    await updateOutboxItem(item.id, retryPatch(item, message, now));
  }
}

export async function syncCollection(deviceId: string): Promise<SyncResult> {
  const outbox = await listOutbox();
  const now = Date.now();
  const due = outbox
    .filter((item) => !item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now)
    .slice(0, BATCH_SIZE);
  let sent = 0;
  let duplicates = 0;
  let failed = 0;
  let pushFailure: unknown = null;

  if (due.length > 0) {
    const serverTime = await getServerTime();
    const sentAt = safeSentAt(new Date(), serverTime);
    try {
      const result = await pushPickups({
        deviceId,
        sentAt,
        items: due.map((item) => ({
          type: 'PICKUP',
          clientId: item.clientId,
          payload: item.payload,
        })),
      });
      const errors = new Map((result.errors ?? []).map((error) => [error.index, error]));
      const removeIds: string[] = [];
      for (const [index, item] of due.entries()) {
        const error = errors.get(index);
        if (!error) {
          removeIds.push(item.id);
          sent += 1;
          continue;
        }
        if (isDuplicate(error)) {
          removeIds.push(item.id);
          duplicates += 1;
          continue;
        }
        failed += 1;
        await updateOutboxItem(
          item.id,
          retryPatch(item, `${error.code}: ${error.message}`),
        );
      }
      await removeOutboxItems(removeIds);
    } catch (error) {
      pushFailure = error;
      failed = due.length;
      await markRetryable(
        due,
        error instanceof Error ? error.message : 'Pickup push failed.',
      );
    }
  }

  let pull: SyncPullResult | null = null;
  try {
    const cursor = await getSyncPullCursor();
    pull = await pullSync(cursor ?? undefined, BATCH_SIZE);
    await applyPull(pull);
  } catch (error) {
    if (!pushFailure) {
      throw error;
    }
  }

  if (pushFailure) {
    throw pushFailure;
  }

  return {
    sent,
    duplicates,
    failed,
    remaining: (await listOutbox()).length,
    pulled: pull?.data.pickups.length ?? 0,
    cursor: pull?.cursor ?? null,
  };
}

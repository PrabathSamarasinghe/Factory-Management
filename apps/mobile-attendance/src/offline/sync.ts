import {
  isNetworkError,
  isPermanentApiError,
  markAttendance,
} from '../api/client';
import {
  listQueue,
  queueCount,
  removeQueueItem,
  updateQueueItem,
} from '../storage/offlineQueue';

export interface SyncResult {
  sent: number;
  failed: number;
  remaining: number;
}

export async function syncQueuedMarks(): Promise<SyncResult> {
  const items = await listQueue();
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    if (item.permanent) {
      continue;
    }
    try {
      await markAttendance({
        clientEventId: item.clientEventId,
        personId: item.payload.personId,
        deviceId: item.payload.deviceId,
        imageBase64: item.payload.imageBase64,
        capturedAt: item.payload.capturedAt,
      });
      await removeQueueItem(item.id);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isNetworkError(error)) {
        await updateQueueItem(item.id, {
          attempts: item.attempts + 1,
          lastError: message,
        });
        break;
      }
      const permanent = isPermanentApiError(error);
      await updateQueueItem(item.id, {
        attempts: item.attempts + 1,
        lastError: message,
        permanent,
      });
      failed += 1;
      if (!permanent) {
        break;
      }
    }
  }

  return { sent, failed, remaining: await queueCount() };
}

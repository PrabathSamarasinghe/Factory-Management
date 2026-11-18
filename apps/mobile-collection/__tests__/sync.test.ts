import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { signIn } from '../src/api/client';
import { syncCollection } from '../src/offline/sync';
import {
  enqueuePickup,
  getSyncPullCursor,
  listOutbox,
  listSyncSnapshots,
  rememberServerTime,
} from '../src/storage/encryptedStore';
import type { PickupPayload } from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

const fetchMock = fetch as unknown as jest.Mock;
const deviceId = '22222222-2222-4222-8222-222222222222';

const payload: PickupPayload = {
  clientPickupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tripId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  supplierId: '11111111-1111-4111-8111-111111111111',
  supplierRegNo: 'REG-1001',
  supplierBarcode: 'BC-1001',
  grossWeightKg: '120.500',
  bagsCount: 12,
  tareKg: '2.000',
  moistureDeductionKg: '1.500',
  recordedAtDevice: '2026-11-18T08:00:00.000Z',
  deviceId,
  scanMethod: 'BARCODE',
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

const pullResponse = {
  data: { pickups: [], weighings: [], dailyTotals: [], discrepancies: [] },
  cursor: '2026-11-18T09:05:00.000Z',
  serverTime: '2026-11-18T09:05:01.000Z',
};

async function authenticate() {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({
      requires2fa: false,
      tokens: {
        accessToken: 'test.access.token',
        refreshToken: 'test.refresh.token',
        expiresIn: 900,
        tokenType: 'Bearer',
        mustChangePassword: false,
      },
      userId: '99999999-9999-4999-8999-999999999999',
      permissions: ['collection:read', 'collection:record'],
    }),
  );
  await signIn('field.user', 'password', deviceId);
}

describe('pickup sync engine', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    ((Keychain as any).__store as Map<string, string>).clear();
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('fetch mock is not configured'));
    await authenticate();
  });

  it('deduplicates enqueue, pushes idempotently, and applies the pull snapshot', async () => {
    await enqueuePickup(payload);
    await enqueuePickup(payload);
    expect(await listOutbox()).toHaveLength(1);

    await rememberServerTime('2099-01-01T00:00:00.000Z');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ accepted: 1, rejected: 0, errors: [], serverTime: pullResponse.serverTime }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(pullResponse));

    const result = await syncCollection(deviceId);
    expect(result).toMatchObject({ sent: 1, duplicates: 0, failed: 0, remaining: 0, pulled: 0 });
    expect(await listOutbox()).toHaveLength(0);
    expect(await getSyncPullCursor()).toBe(pullResponse.cursor);
    expect(await listSyncSnapshots()).toHaveLength(1);

    const pushCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/sync/push'));
    const body = JSON.parse(pushCall[1].body);
    expect(body.items[0]).toMatchObject({ type: 'PICKUP', clientId: payload.clientPickupId });
    expect(body.items[0].payload.clientPickupId).toBe(payload.clientPickupId);
    expect(pushCall[1].headers['x-client-app']).toBe('COLLECTION_MOBILE');
    expect(pushCall[1].headers['x-permissions']).toContain('collection:record');
    expect(Date.parse(body.sentAt)).toBeLessThanOrEqual(Date.parse('2099-01-01T00:00:01.000Z'));
    expect(body.sentAt.slice(0, 4)).toBe('2099');
  });

  it('removes server-reported duplicates from the outbox', async () => {
    await enqueuePickup(payload);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accepted: 0,
        rejected: 1,
        errors: [{ index: 0, code: 'CONFLICT', message: 'Pickup already exists.' }],
        serverTime: pullResponse.serverTime,
      }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(pullResponse));

    const result = await syncCollection(deviceId);
    expect(result.duplicates).toBe(1);
    expect(await listOutbox()).toHaveLength(0);
  });

  it('keeps retryable failures queued with backoff', async () => {
    await enqueuePickup(payload);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accepted: 0,
        rejected: 1,
        errors: [{ index: 0, code: 'SYNC_ITEM_REJECTED', message: 'Temporarily unavailable.' }],
        serverTime: pullResponse.serverTime,
      }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(pullResponse));

    const result = await syncCollection(deviceId);
    expect(result).toMatchObject({ sent: 0, duplicates: 0, failed: 1, remaining: 1 });
    const [item] = await listOutbox();
    expect(item).toMatchObject({ attempts: 1 });
    expect(item.lastError).toContain('Temporarily unavailable');
    expect(Date.parse(item.nextAttemptAt ?? '')).toBeGreaterThan(Date.now());

    const pushCallsBefore = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/sync/push'),
    ).length;
    fetchMock.mockResolvedValueOnce(jsonResponse(pullResponse));
    await syncCollection(deviceId);
    const pushCallsAfter = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/sync/push'),
    ).length;
    expect(pushCallsAfter).toBe(pushCallsBefore);
    expect(await listOutbox()).toHaveLength(1);
  });
});

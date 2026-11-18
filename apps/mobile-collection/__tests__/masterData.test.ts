import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { signIn } from '../src/api/client';
import { refreshMasterData } from '../src/offline/masterData';
import {
  getMasterDataCursor,
  listRoutes,
  listSuppliers,
} from '../src/storage/encryptedStore';
import type { MasterDataSnapshot } from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

const fetchMock = fetch as unknown as jest.Mock;
const deviceId = '22222222-2222-4222-8222-222222222222';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function snapshot(
  cursor: string,
  supplierName: string,
  includeSecondSupplier: boolean,
): MasterDataSnapshot {
  return {
    suppliers: [
      {
        supplierId: '11111111-1111-4111-8111-111111111111',
        code: 'SUP-1001',
        supplierCode: 'S1001',
        supplierRegNo: 'REG-1001',
        supplierRegNoNormalized: 'REG1001',
        barcodeValue: 'BC-1001',
        fullName: supplierName,
        preferredName: supplierName,
        status: 'ACTIVE',
      },
      ...(includeSecondSupplier
        ? [
            {
              supplierId: '33333333-3333-4333-8333-333333333333',
              code: 'SUP-1002',
              supplierCode: 'S1002',
              supplierRegNo: 'REG-1002',
              supplierRegNoNormalized: 'REG1002',
              barcodeValue: 'BC-1002',
              fullName: 'Supplier Two',
              preferredName: 'Two',
              status: 'ACTIVE',
            },
          ]
        : []),
    ],
    routes: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        code: 'RTE-1',
        name: 'North route',
        status: 'ACTIVE',
        stops: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            supplierId: '11111111-1111-4111-8111-111111111111',
            sequence: 1,
          },
        ],
      },
    ],
    cursor,
    serverTime: '2026-11-18T08:05:00.000Z',
  };
}

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

describe('master-data delta download', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    ((Keychain as any).__store as Map<string, string>).clear();
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('fetch mock is not configured'));
  });

  it('merges deltas, advances the cursor, and sends collection:read headers', async () => {
    await authenticate();

    fetchMock.mockResolvedValueOnce(jsonResponse(snapshot('2026-11-18T08:00:00.000Z', 'Supplier One v1', false)));
    await refreshMasterData();

    fetchMock.mockResolvedValueOnce(jsonResponse(snapshot('2026-11-18T08:10:00.000Z', 'Supplier One v2', true)));
    await refreshMasterData();

    const suppliers = await listSuppliers();
    const routes = await listRoutes();
    expect(suppliers).toHaveLength(2);
    expect(suppliers[0]).toMatchObject({ fullName: 'Supplier One v2', preferredName: 'Supplier One v2' });
    expect(routes[0].stops[0]).toMatchObject({ sequence: 1 });
    expect(await getMasterDataCursor()).toBe('2026-11-18T08:10:00.000Z');

    const pullCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/collection/master-data/pull'),
    );
    expect(pullCalls).toHaveLength(2);
    expect(String(pullCalls[1][0])).toContain('since=2026-11-18T08%3A00%3A00.000Z');
    expect(pullCalls[1][1].headers['x-client-app']).toBe('COLLECTION_MOBILE');
    expect(pullCalls[1][1].headers['x-user-id']).toBe('99999999-9999-4999-8999-999999999999');
    expect(pullCalls[1][1].headers['x-permissions']).toContain('collection:read');
  });
});

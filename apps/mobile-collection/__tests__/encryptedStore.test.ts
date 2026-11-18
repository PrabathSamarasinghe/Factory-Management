import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {
  applyPull,
  decryptRecords,
  getDataEncryptionKey,
  listSuppliers,
  listSyncedDailyTotals,
  upsertMasterData,
} from '../src/storage/encryptedStore';
import type { MasterDataSnapshot, SyncPullResult } from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

const snapshot = {
  suppliers: [
    {
      supplierId: '11111111-1111-4111-8111-111111111111',
      code: 'SUP-1001',
      supplierCode: 'S1001',
      supplierRegNo: 'REG-1001',
      supplierRegNoNormalized: 'REG1001',
      barcodeValue: 'BC-1001',
      fullName: 'Supplier One',
      preferredName: 'One',
      status: 'ACTIVE',
    },
  ],
  routes: [],
  cursor: '2026-11-18T08:00:00.000Z',
  serverTime: '2026-11-18T08:00:05.000Z',
} satisfies MasterDataSnapshot;

describe('encrypted local repository', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    ((Keychain as any).__store as Map<string, string>).clear();
  });

  it('round-trips cached records and encrypts them at rest', async () => {
    await upsertMasterData(snapshot);

    const suppliers = await listSuppliers();
    expect(suppliers).toEqual(snapshot.suppliers);

    const raw = await AsyncStorage.getItem('galatura.collection.v1.suppliers');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('SUP-1001');
    expect(raw).not.toContain('Supplier One');

    const key = await getDataEncryptionKey();
    expect(decryptRecords(raw ?? '', key)).toEqual(snapshot.suppliers);

    const storedKey = await Keychain.getGenericPassword({
      service: 'com.galatura.collection.local-data-key',
    });
    expect(storedKey).toBeTruthy();
    expect((storedKey as any).password).toBe(key);
  });

  it('keeps read-only SMS status in the latest sync snapshot', async () => {
    const pull: SyncPullResult = {
      cursor: '2026-11-18T09:00:00.000Z',
      serverTime: '2026-11-18T09:00:05.000Z',
      data: {
        pickups: [],
        weighings: [],
        discrepancies: [],
        dailyTotals: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            supplierId: '11111111-1111-4111-8111-111111111111',
            collectionDate: '2026-11-18',
            totalNetKg: '1250.500',
            totalBags: 25,
            finalized: true,
            smsStatus: 'SENT',
          },
        ],
      },
    };

    await applyPull(pull);

    await expect(listSyncedDailyTotals()).resolves.toEqual([
      expect.objectContaining({
        id: pull.data.dailyTotals[0].id,
        smsStatus: 'SENT',
        totalBags: 25,
      }),
    ]);
  });
});

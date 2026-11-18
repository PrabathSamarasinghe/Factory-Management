import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import * as Keychain from 'react-native-keychain';
import type {
  CachedPickup,
  MasterDataSnapshot,
  OutboxItem,
  PickupPayload,
  Route,
  Supplier,
  SyncCursorRow,
  SyncData,
  SyncSnapshotRow,
  SyncPullResult,
} from '../types';
import { uuidV4 } from '../utils/uuid';

const ENCRYPTION_KEY_SERVICE = 'com.galatura.collection.local-data-key';

const TABLE_KEYS = {
  suppliers: 'galatura.collection.v1.suppliers',
  routes: 'galatura.collection.v1.routes',
  pickups: 'galatura.collection.v1.pickups',
  outbox: 'galatura.collection.v1.outbox',
  cursor: 'galatura.collection.v1.cursor',
  syncSnapshots: 'galatura.collection.v1.syncSnapshots',
} as const;

type TableName = keyof typeof TABLE_KEYS;

let cursorWrite: Promise<void> = Promise.resolve();

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function toSupplier(value: Partial<Supplier>): Supplier | null {
  const supplierId = text(value.supplierId);
  if (!supplierId) {
    return null;
  }
  return {
    supplierId,
    code: text(value.code),
    supplierCode: text(value.supplierCode),
    supplierRegNo: text(value.supplierRegNo),
    supplierRegNoNormalized: text(value.supplierRegNoNormalized),
    barcodeValue: text(value.barcodeValue),
    fullName: text(value.fullName),
    preferredName: text(value.preferredName),
    status: text(value.status),
  };
}

function toRoute(value: Partial<Route>): Route | null {
  const id = text(value.id);
  if (!id) {
    return null;
  }
  const stops = Array.isArray(value.stops)
    ? value.stops
        .map((stop) => ({
          id: text(stop?.id),
          supplierId: text(stop?.supplierId),
          sequence: Number(stop?.sequence ?? 0),
        }))
        .filter((stop) => Boolean(stop.id) && Boolean(stop.supplierId))
    : [];
  return {
    id,
    code: text(value.code),
    name: text(value.name),
    status: text(value.status),
    stops,
  };
}

function toCachedPickup(value: Partial<CachedPickup>): CachedPickup | null {
  const clientPickupId = text(value.clientPickupId);
  const supplierId = text(value.supplierId);
  if (!clientPickupId || !supplierId) {
    return null;
  }
  return {
    clientPickupId,
    tripId: text(value.tripId),
    supplierId,
    supplierRegNo: text(value.supplierRegNo),
    supplierBarcode: text(value.supplierBarcode) || undefined,
    routeStopId: text(value.routeStopId) || undefined,
    grossWeightKg: text(value.grossWeightKg),
    bagsCount: Number(value.bagsCount ?? 0),
    tareKg: text(value.tareKg) || '0',
    moistureDeductionKg: text(value.moistureDeductionKg) || '0',
    recordedAtDevice: text(value.recordedAtDevice),
    deviceId: text(value.deviceId),
    scanMethod: value.scanMethod === 'REG_NO' ? 'REG_NO' : 'BARCODE',
    manualReason: text(value.manualReason) || undefined,
    gpsLat: text(value.gpsLat) || undefined,
    gpsLng: text(value.gpsLng) || undefined,
    id: text(value.id) || undefined,
    status: text(value.status) || undefined,
    receivedAtServer: text(value.receivedAtServer) || undefined,
    updatedAt: text(value.updatedAt) || undefined,
    version: value.version === undefined ? undefined : Number(value.version),
  };
}

function upsertBy<T>(rows: T[], incoming: T[], keyOf: (row: T) => string): T[] {
  const merged = new Map(rows.map((row) => [keyOf(row), row]));
  for (const row of incoming) {
    const key = keyOf(row);
    if (key) {
      merged.set(key, row);
    }
  }
  return [...merged.values()];
}

export async function getDataEncryptionKey(): Promise<string> {
  const existing = await Keychain.getGenericPassword({ service: ENCRYPTION_KEY_SERVICE });
  if (existing) {
    return existing.password;
  }
  const created = `${uuidV4()}${uuidV4()}${uuidV4()}${uuidV4()}`;
  await Keychain.setGenericPassword('local-data-key', created, {
    service: ENCRYPTION_KEY_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return created;
}

export function encryptRecords(rows: unknown, key: string): string {
  return CryptoJS.AES.encrypt(JSON.stringify(rows), key).toString();
}

export function decryptRecords<T>(cipherText: string, key: string): T {
  const bytes = CryptoJS.AES.decrypt(cipherText, key);
  const plainText = bytes.toString(CryptoJS.enc.Utf8);
  if (!plainText) {
    throw new Error('Encrypted local data could not be decrypted.');
  }
  return JSON.parse(plainText) as T;
}

async function readTable<T>(table: TableName): Promise<T[]> {
  const raw = await AsyncStorage.getItem(TABLE_KEYS[table]);
  if (!raw) {
    return [];
  }
  try {
    const key = await getDataEncryptionKey();
    const rows = decryptRecords<unknown>(raw, key);
    return Array.isArray(rows) ? (rows as T[]) : [];
  } catch {
    return [];
  }
}

async function writeTable<T>(table: TableName, rows: T[]): Promise<void> {
  const key = await getDataEncryptionKey();
  await AsyncStorage.setItem(TABLE_KEYS[table], encryptRecords(rows, key));
}

export async function listSuppliers(): Promise<Supplier[]> {
  return readTable<Supplier>('suppliers');
}

export async function listRoutes(): Promise<Route[]> {
  return readTable<Route>('routes');
}

export async function listCachedPickups(): Promise<CachedPickup[]> {
  return readTable<CachedPickup>('pickups');
}

export async function listSyncSnapshots(): Promise<SyncSnapshotRow[]> {
  return readTable<SyncSnapshotRow>('syncSnapshots');
}

export async function upsertMasterData(snapshot: MasterDataSnapshot): Promise<void> {
  const suppliers = snapshot.suppliers
    .map((supplier) => toSupplier(supplier))
    .filter((supplier): supplier is Supplier => Boolean(supplier));
  const routes = snapshot.routes
    .map((route) => toRoute(route))
    .filter((route): route is Route => Boolean(route));
  await Promise.all([
    writeTable(
      'suppliers',
      upsertBy(await readTable<Supplier>('suppliers'), suppliers, (row) => row.supplierId),
    ),
    writeTable('routes', upsertBy(await readTable<Route>('routes'), routes, (row) => row.id)),
    writeCursor('masterData', text(snapshot.cursor)),
  ]);
}

export async function enqueuePickup(payload: PickupPayload): Promise<OutboxItem> {
  const rows = await readTable<OutboxItem>('outbox');
  const existing = rows.find((row) => row.clientId === payload.clientPickupId);
  if (existing) {
    return existing;
  }
  const item: OutboxItem = {
    id: uuidV4(),
    clientId: payload.clientPickupId,
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    payload,
  };
  await Promise.all([
    writeTable('outbox', [...rows, item]),
    writeTable(
      'pickups',
      upsertBy(
        await readTable<CachedPickup>('pickups'),
        [payload].map((pickup) => toCachedPickup(pickup)).filter(Boolean) as CachedPickup[],
        (row) => row.clientPickupId,
      ),
    ),
  ]);
  return item;
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const rows = await readTable<OutboxItem>('outbox');
  return [...rows].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function updateOutboxItem(
  id: string,
  patch: Partial<Omit<OutboxItem, 'id' | 'clientId' | 'payload'>>,
): Promise<void> {
  const rows = await readTable<OutboxItem>('outbox');
  await writeTable(
    'outbox',
    rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
  );
}

export async function removeOutboxItems(ids: string[]): Promise<void> {
  const remove = new Set(ids);
  const rows = await readTable<OutboxItem>('outbox');
  await writeTable(
    'outbox',
    rows.filter((row) => !remove.has(row.id)),
  );
}

export async function clearOutbox(): Promise<void> {
  await writeTable('outbox', []);
}

function readCursor(key: string): Promise<string | null> {
  const task = cursorWrite.then(async () => {
    const rows = await readTable<SyncCursorRow>('cursor');
    return rows.find((row) => row.key === key)?.value ?? null;
  });
  cursorWrite = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function writeCursor(key: string, value: string): Promise<void> {
  const task = cursorWrite.then(async () => {
    const rows = await readTable<SyncCursorRow>('cursor');
    const updated = upsertBy(
      rows,
      [{ key, value, updatedAt: new Date().toISOString() }],
      (row) => row.key,
    );
    await writeTable('cursor', updated);
  });
  cursorWrite = task.catch(() => undefined);
  return task;
}

export async function getMasterDataCursor(): Promise<string | null> {
  return readCursor('masterData');
}

export async function getSyncPullCursor(): Promise<string | null> {
  return readCursor('collectionSync');
}

export async function getServerTime(): Promise<string | null> {
  return readCursor('serverTime');
}

export async function rememberServerTime(serverTime: string): Promise<void> {
  if (text(serverTime)) {
    await writeCursor('serverTime', serverTime);
  }
}

export async function applyPull(result: SyncPullResult): Promise<void> {
  const pickups = (Array.isArray(result.data?.pickups) ? result.data.pickups : [])
    .map((pickup) => toCachedPickup(pickup))
    .filter((pickup): pickup is CachedPickup => Boolean(pickup));
  const weighings = Array.isArray(result.data?.weighings) ? result.data.weighings : [];
  const dailyTotals = Array.isArray(result.data?.dailyTotals) ? result.data.dailyTotals : [];
  const discrepancies = Array.isArray(result.data?.discrepancies) ? result.data.discrepancies : [];
  const data: SyncData = { pickups, weighings, dailyTotals, discrepancies };
  const snapshot: SyncSnapshotRow = {
    id: 'latest',
    cursor: text(result.cursor),
    serverTime: text(result.serverTime),
    data,
    savedAt: new Date().toISOString(),
  };
  await Promise.all([
    writeTable(
      'pickups',
      upsertBy(
        await readTable<CachedPickup>('pickups'),
        pickups,
        (row) => row.clientPickupId || row.id || '',
      ),
    ),
    writeTable(
      'syncSnapshots',
      upsertBy(await readTable<SyncSnapshotRow>('syncSnapshots'), [snapshot], (row) => row.id),
    ),
  ]);
  await writeCursor('collectionSync', text(result.cursor));
  if (text(result.serverTime)) {
    await writeCursor('serverTime', text(result.serverTime));
  }
}

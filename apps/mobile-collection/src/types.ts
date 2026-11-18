export type ScanMethod = 'BARCODE' | 'REG_NO';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  mustChangePassword: boolean;
}

export interface LoginResult {
  requires2fa: boolean;
  challengeToken?: string;
  tokens?: AuthTokens;
  userId?: string;
  permissions?: string[];
}

export interface Supplier {
  supplierId: string;
  code: string;
  supplierCode: string;
  supplierRegNo: string;
  supplierRegNoNormalized: string;
  barcodeValue: string;
  fullName: string;
  preferredName: string;
  status: string;
}

export interface RouteStop {
  id: string;
  supplierId: string;
  sequence: number;
}

export interface Route {
  id: string;
  code: string;
  name: string;
  status: string;
  stops: RouteStop[];
}

export interface MasterDataSnapshot {
  suppliers: Supplier[];
  routes: Route[];
  cursor: string;
  serverTime: string;
}

export interface PickupPayload {
  clientPickupId: string;
  tripId: string;
  supplierId: string;
  supplierRegNo: string;
  supplierBarcode?: string;
  routeStopId?: string;
  grossWeightKg: string;
  bagsCount: number;
  tareKg: string;
  moistureDeductionKg: string;
  recordedAtDevice: string;
  deviceId: string;
  scanMethod: ScanMethod;
  manualReason?: string;
  gpsLat?: string;
  gpsLng?: string;
}

export interface CachedPickup extends PickupPayload {
  id?: string;
  status?: string;
  receivedAtServer?: string;
  updatedAt?: string;
  version?: number;
}

export interface OutboxItem {
  id: string;
  clientId: string;
  createdAt: string;
  attempts: number;
  nextAttemptAt?: string;
  lastError?: string;
  permanent?: boolean;
  payload: PickupPayload;
}

export type SmsStatus = 'NOT_REQUIRED' | 'PENDING' | 'SENT' | 'FAILED';

export interface DailySupplierTotal {
  id: string;
  supplierId: string;
  collectionDate: string;
  totalNetKg: string;
  totalBags: number;
  tripId?: string;
  finalized: boolean;
  finalizedAt?: string;
  finalizedBy?: string;
  smsStatus: SmsStatus;
  smsMessageId?: string;
  version?: number;
  updatedAt?: string;
}

export interface SyncData {
  pickups: CachedPickup[];
  weighings: Record<string, unknown>[];
  dailyTotals: DailySupplierTotal[];
  discrepancies: Record<string, unknown>[];
}

export interface SyncSnapshotRow {
  id: string;
  cursor: string;
  serverTime: string;
  data: SyncData;
  savedAt: string;
}

export interface SyncCursorRow {
  key: string;
  value: string;
  updatedAt: string;
}

export interface SyncPushRequest {
  deviceId: string;
  sentAt: string;
  items: Array<{ type: 'PICKUP'; clientId: string; payload: PickupPayload }>;
}

export interface SyncPushError {
  index: number;
  code: string;
  message: string;
}

export interface SyncPushResult {
  accepted: number;
  rejected: number;
  errors: SyncPushError[];
  serverTime: string;
}

export interface SyncPullResult {
  data: SyncData;
  cursor: string;
  serverTime: string;
}

export interface ManualEntryRecord {
  id?: string;
  clientPickupId: string;
  tripId: string;
  supplierRegNo: string;
  manualReason?: string;
  recordedAtDevice: string;
  grossWeightKg: string;
  bagsCount: number;
}

export interface ManualEntryGroup {
  helperId: string;
  count: number;
  entries: ManualEntryRecord[];
}

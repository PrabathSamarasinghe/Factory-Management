import { hasSession, pullMasterData } from '../api/client';
import { getMasterDataCursor, upsertMasterData } from '../storage/encryptedStore';
import type { MasterDataSnapshot } from '../types';

export async function refreshMasterData(): Promise<MasterDataSnapshot> {
  if (!hasSession()) {
    throw new Error('Sign in before refreshing master data.');
  }
  const cursor = await getMasterDataCursor();
  const snapshot = await pullMasterData(cursor ?? undefined);
  await upsertMasterData(snapshot);
  return snapshot;
}

import CryptoJS from 'crypto-js';
import * as Keychain from 'react-native-keychain';
import { uuidV4 } from '../utils/uuid';

const QUEUE_KEY_SERVICE = 'com.galatura.attendance.offline-queue-key';

export async function getQueueEncryptionKey(): Promise<string> {
  const existing = await Keychain.getGenericPassword({ service: QUEUE_KEY_SERVICE });
  if (existing) {
    return existing.password;
  }
  const created = `${uuidV4()}${uuidV4()}${uuidV4()}${uuidV4()}`;
  await Keychain.setGenericPassword('offline-queue-key', created, {
    service: QUEUE_KEY_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return created;
}

export function encryptQueue<T>(rows: readonly T[], key: string): string {
  return CryptoJS.AES.encrypt(JSON.stringify(rows), key).toString();
}

export function decryptQueue<T>(cipherText: string, key: string): T[] {
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, key);
    const plainText = bytes.toString(CryptoJS.enc.Utf8);
    if (!plainText) {
      throw new Error('Encrypted offline queue could not be decrypted.');
    }
    const parsed = JSON.parse(plainText);
    if (!Array.isArray(parsed)) {
      throw new Error('Encrypted offline queue is not an array.');
    }
    return parsed as T[];
  } catch {
    throw new Error('Encrypted offline queue could not be decrypted.');
  }
}

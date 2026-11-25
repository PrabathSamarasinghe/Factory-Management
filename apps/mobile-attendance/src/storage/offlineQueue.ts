import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueuedMark } from '../types';
import { decryptQueue, encryptQueue, getQueueEncryptionKey } from './queueCrypto';

const QUEUE_KEY = 'galatura.attendance.offlineQueue';
const MAX_QUEUE_SIZE = 40;

async function readQueue(): Promise<QueuedMark[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const key = await getQueueEncryptionKey();
    return decryptQueue<QueuedMark>(raw, key);
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedMark[]): Promise<void> {
  const key = await getQueueEncryptionKey();
  await AsyncStorage.setItem(
    QUEUE_KEY,
    encryptQueue(items.slice(-MAX_QUEUE_SIZE), key),
  );
}

export async function listQueue(): Promise<QueuedMark[]> {
  return readQueue();
}

export async function queueCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function enqueueMark(item: QueuedMark): Promise<void> {
  const items = await readQueue();
  items.push(item);
  await writeQueue(items);
}

export async function removeQueueItem(id: string): Promise<void> {
  const items = await readQueue();
  await writeQueue(items.filter((item) => item.id !== id));
}

export async function updateQueueItem(
  id: string,
  patch: Partial<QueuedMark>,
): Promise<void> {
  const items = await readQueue();
  await writeQueue(
    items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  );
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

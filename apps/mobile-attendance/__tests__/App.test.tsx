import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearQueue,
  enqueueMark,
  listQueue,
  queueCount,
  removeQueueItem,
  updateQueueItem,
} from '../src/storage/offlineQueue';
import type { QueuedMark } from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

jest.mock('react-native-keychain', () => {
  const store = new Map<string, string>();
  return {
    ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' },
    setGenericPassword: jest.fn(async (_username: string, password: string, options: any) => {
      store.set(options.service, password);
      return { service: options.service };
    }),
    getGenericPassword: jest.fn(async (options: any) => {
      const password = store.get(options.service);
      return password ? { username: 'key', password } : false;
    }),
  };
});

function queued(id: string): QueuedMark {
  return {
    id,
    clientEventId: `client-${id}`,
    createdAt: '2026-11-18T08:00:00.000Z',
    attempts: 0,
    payload: {
      imageBase64: 'abc',
      capturedAt: '2026-11-18T08:00:00.000Z',
    },
  };
}

describe('offline attendance queue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists, updates and removes queued marks', async () => {
    await enqueueMark(queued('one'));
    await enqueueMark(queued('two'));
    expect(await queueCount()).toBe(2);

    await updateQueueItem('one', { attempts: 2, lastError: 'offline' });
    const items = await listQueue();
    expect(items[0]).toMatchObject({
      id: 'one',
      attempts: 2,
      lastError: 'offline',
    });

    await removeQueueItem('two');
    expect((await listQueue()).map((item) => item.id)).toEqual(['one']);
  });

  it('keeps only the most recent 40 captures', async () => {
    for (let index = 0; index < 45; index += 1) {
      await enqueueMark(queued(String(index)));
    }
    const items = await listQueue();
    expect(items).toHaveLength(40);
    expect(items[0].id).toBe('5');
    expect(items[39].id).toBe('44');
  });

  it('encrypts face images in the persisted queue', async () => {
    const item = queued('secure');
    item.payload.imageBase64 = 'FACE-IMAGE-SECRET';
    await enqueueMark(item);

    const raw = await AsyncStorage.getItem('galatura.attendance.offlineQueue');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('FACE-IMAGE-SECRET');
    expect((await listQueue())[0].payload.imageBase64).toBe('FACE-IMAGE-SECRET');
  });

  it('recovers from corrupt queue data', async () => {
    await AsyncStorage.setItem('galatura.attendance.offlineQueue', '{not-json');
    expect(await listQueue()).toEqual([]);
    await clearQueue();
    expect(await queueCount()).toBe(0);
  });
});

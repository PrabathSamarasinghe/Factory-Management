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

  it('recovers from corrupt queue data', async () => {
    await AsyncStorage.setItem('galatura.attendance.offlineQueue', '{not-json');
    expect(await listQueue()).toEqual([]);
    await clearQueue();
    expect(await queueCount()).toBe(0);
  });
});

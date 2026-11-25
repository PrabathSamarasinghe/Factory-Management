import { decryptQueue, encryptQueue } from '../src/storage/queueCrypto';
import type { QueuedMark } from '../src/types';

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' },
  setGenericPassword: jest.fn(async () => ({})),
  getGenericPassword: jest.fn(async () => false),
}));

const key = 'test-only-local-data-key';

function queued(): QueuedMark {
  return {
    id: 'one',
    clientEventId: 'client-one',
    createdAt: '2026-11-25T08:00:00.000Z',
    attempts: 0,
    payload: {
      imageBase64: 'SENSITIVE-FACE-IMAGE',
      capturedAt: '2026-11-25T08:00:00.000Z',
    },
  };
}

describe('offline queue encryption helpers', () => {
  it('round-trips encrypted rows without exposing face images', () => {
    const rows = [queued()];
    const cipherText = encryptQueue(rows, key);

    expect(cipherText).not.toContain('SENSITIVE-FACE-IMAGE');
    expect(decryptQueue<QueuedMark>(cipherText, key)).toEqual(rows);
  });

  it('rejects data encrypted with a different key', () => {
    const cipherText = encryptQueue([queued()], key);
    expect(() => decryptQueue(cipherText, 'different-key')).toThrow(
      /could not be decrypted/,
    );
  });
});

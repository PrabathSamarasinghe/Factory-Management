import { describe, expect, it, vi } from 'vitest';
import {
  AwsKmsKeyProvider,
  EnvKeyProvider,
  ErrorCodes,
  FirebaseFileStorage,
  NotImplementedError,
  S3FileStorage,
  generateMasterKey,
  validateObjectKey,
} from '../src';

function fakeFile() {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue([Buffer.from('stored')]),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue([true]),
    getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example/object']),
  };
}

describe('FirebaseFileStorage', () => {
  it('writes private objects with metadata', async () => {
    const file = fakeFile();
    const storage = new FirebaseFileStorage({ file: () => file });

    await storage.putObject({
      key: 'documents/nic/front.jpg',
      body: Buffer.from('image'),
      contentType: 'image/jpeg',
      cacheControl: 'private, max-age=0',
      metadata: { owner: 'person-1' },
    });

    expect(file.save).toHaveBeenCalledWith(Buffer.from('image'), {
      resumable: false,
      contentType: 'image/jpeg',
      metadata: {
        cacheControl: 'private, max-age=0',
        metadata: { owner: 'person-1' },
      },
    });
  });

  it('reads, deletes and signs short-lived URLs', async () => {
    const file = fakeFile();
    const storage = new FirebaseFileStorage({ file: () => file });

    await expect(storage.getObject('a/b.pdf')).resolves.toEqual(Buffer.from('stored'));
    await expect(storage.exists('a/b.pdf')).resolves.toBe(true);
    await storage.deleteObject('a/b.pdf');
    await expect(storage.getDownloadUrl('a/b.pdf', { expiresInSeconds: 60 })).resolves.toBe(
      'https://signed.example/object',
    );
    await expect(
      storage.getUploadUrl('a/c.pdf', { expiresInSeconds: 60, contentType: 'application/pdf' }),
    ).resolves.toBe('https://signed.example/object');

    expect(file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
    expect(file.getSignedUrl).toHaveBeenNthCalledWith(1, {
      action: 'read',
      expires: expect.any(Date),
      version: 'v4',
    });
    expect(file.getSignedUrl).toHaveBeenNthCalledWith(2, {
      action: 'write',
      expires: expect.any(Date),
      contentType: 'application/pdf',
      version: 'v4',
    });
  });

  it('rejects unsafe keys and long signed URLs', async () => {
    const storage = new FirebaseFileStorage({ file: fakeFile });

    await expect(storage.getObject('../secrets')).rejects.toThrow(/path segments/);
    await expect(storage.getDownloadUrl('a/b.pdf', { expiresInSeconds: 3600 })).rejects.toThrow(
      /1 to 900/,
    );
    expect(() => validateObjectKey('/absolute')).toThrow(/relative/);
    expect(() => validateObjectKey('a//b')).toThrow(/path segments/);
  });
});

describe('stubs for the AWS migration', () => {
  it('fails closed instead of silently using an unimplemented adapter', async () => {
    const storage = new S3FileStorage({ region: 'ap-southeast-1', bucket: 'galatura' });
    await expect(storage.getDownloadUrl('a/b.pdf')).rejects.toBeInstanceOf(NotImplementedError);
    await expect(storage.putObject({ key: 'a/b.pdf', body: 'x' })).rejects.toMatchObject({
      code: ErrorCodes.NOT_IMPLEMENTED,
    });

    const kms = new AwsKmsKeyProvider({ keyId: 'alias/galatura' });
    expect(kms.activeKeyId).toBe('alias/galatura');
    await expect(kms.getActiveKey()).rejects.toMatchObject({
      code: ErrorCodes.NOT_IMPLEMENTED,
    });
  });

  it('keeps EnvKeyProvider as the working phase-1 provider', async () => {
    const keys = new EnvKeyProvider({ masterKey: generateMasterKey(), keyId: 'env-1' });
    await expect(keys.getActiveKey()).resolves.toMatchObject({ keyId: 'env-1' });
  });
});

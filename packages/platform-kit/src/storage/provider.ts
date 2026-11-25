import { DependencyUnavailableError, ValidationError } from '../errors';
import {
  FirebaseFileStorage,
  type FirebaseBucketLike,
  type FirebaseFileStorageOptions,
} from './firebase';
import { S3FileStorage, type S3FileStorageOptions } from './s3';
import type { FileStorage, PutObjectInput, SignedUrlOptions } from './file-storage';

export type StorageProvider = 'firebase' | 's3';

export interface StorageProviderConfig {
  provider?: StorageProvider;
  firebaseBucket?: FirebaseBucketLike;
  firebase?: FirebaseFileStorageOptions;
  s3?: S3FileStorageOptions;
}

let configured: StorageProviderConfig = {};

export function configureStorage(config: StorageProviderConfig): void {
  configured = { ...config };
}

export function resetStorageConfiguration(): void {
  configured = {};
}

export function createFileStorage(options: StorageProviderConfig = {}): FileStorage {
  const config: StorageProviderConfig = { ...configured, ...options };
  const rawProvider =
    config.provider ??
    (process.env.STORAGE_PROVIDER || 'firebase').toLowerCase();
  if (rawProvider !== 'firebase' && rawProvider !== 's3') {
    throw new ValidationError(`Unsupported storage provider "${rawProvider}".`);
  }

  if (rawProvider === 's3') {
    return new S3FileStorage(
      config.s3 ?? {
        region: process.env.STORAGE_REGION,
        bucket: process.env.STORAGE_BUCKET,
      },
    );
  }

  if (!config.firebaseBucket) {
    return new UnconfiguredFileStorage(
      'Firebase storage bucket is not configured. Provide it through configureStorage() at bootstrap.',
    );
  }

  return new FirebaseFileStorage(config.firebaseBucket, {
    signedUrlVersion: config.firebase?.signedUrlVersion ?? readSignedUrlVersion(),
  });
}

function readSignedUrlVersion(): 'v2' | 'v4' {
  return process.env.STORAGE_SIGNED_URL_VERSION?.toLowerCase() === 'v2' ? 'v2' : 'v4';
}

class UnconfiguredFileStorage implements FileStorage {
  constructor(private readonly reason: string) {}

  async putObject(_input: PutObjectInput): Promise<void> {
    this.fail();
  }

  async getObject(_key: string): Promise<Buffer> {
    return this.fail();
  }

  async deleteObject(_key: string): Promise<void> {
    this.fail();
  }

  async getDownloadUrl(_key: string, _options?: SignedUrlOptions): Promise<string> {
    return this.fail();
  }

  async getUploadUrl(_key: string, _options?: SignedUrlOptions): Promise<string> {
    return this.fail();
  }

  async exists(_key: string): Promise<boolean> {
    return this.fail();
  }

  private fail(): never {
    throw new DependencyUnavailableError(this.reason);
  }
}

import { NotImplementedError } from '../errors';
import type { FileStorage, PutObjectInput, SignedUrlOptions } from './file-storage';

export interface S3FileStorageOptions {
  region?: string;
  bucket?: string;
  /** Injected `S3Client` when the AWS implementation lands (task 12.x). */
  client?: unknown;
}

/**
 * Placeholder for the AWS S3 adapter. Keeping the class and interface in place
 * makes the Firebase -> S3 migration a configuration change for services.
 */
export class S3FileStorage implements FileStorage {
  constructor(readonly options: S3FileStorageOptions = {}) {}

  async putObject(_input: PutObjectInput): Promise<void> {
    return this.notImplemented();
  }

  async getObject(_key: string): Promise<Buffer> {
    return this.notImplemented();
  }

  async deleteObject(_key: string): Promise<void> {
    return this.notImplemented();
  }

  async getDownloadUrl(_key: string, _options?: SignedUrlOptions): Promise<string> {
    return this.notImplemented();
  }

  async getUploadUrl(_key: string, _options?: SignedUrlOptions): Promise<string> {
    return this.notImplemented();
  }

  async exists(_key: string): Promise<boolean> {
    return this.notImplemented();
  }

  private notImplemented(): never {
    throw new NotImplementedError(
      'S3FileStorage is a stub. Use FirebaseFileStorage until the AWS migration.',
    );
  }
}

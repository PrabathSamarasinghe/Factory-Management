import {
  byteLength,
  signedUrlExpiryDate,
  validateObjectKey,
  validateUploadInput,
  type FileStorage,
  type PutObjectInput,
  type SignedUrlOptions,
} from './file-storage';

/** Minimal subset of `@google-cloud/storage`'s File used by the adapter. */
export interface FirebaseFileLike {
  save(
    data: Buffer | string,
    options?: {
      resumable?: boolean;
      contentType?: string;
      metadata?: { cacheControl?: string; metadata?: Record<string, string> };
    },
  ): Promise<unknown>;
  download(): Promise<[Buffer]>;
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
  exists(): Promise<[boolean]>;
  getSignedUrl(config: {
    action: 'read' | 'write';
    expires: Date;
    contentType?: string;
    version?: 'v2' | 'v4';
  }): Promise<[string]>;
}

/** Minimal subset of a `firebase-admin` / Cloud Storage bucket. */
export interface FirebaseBucketLike {
  file(path: string): FirebaseFileLike;
}

export interface FirebaseFileStorageOptions {
  /** Defaults to V4 signing. */
  signedUrlVersion?: 'v2' | 'v4';
}

/**
 * Firebase Cloud Storage adapter. The caller supplies an initialized bucket
 * (`getStorage().bucket()`) so this package does not depend on firebase-admin
 * or on service-account loading.
 */
export class FirebaseFileStorage implements FileStorage {
  constructor(
    private readonly bucket: FirebaseBucketLike,
    private readonly options: FirebaseFileStorageOptions = {},
  ) {}

  async putObject(input: PutObjectInput): Promise<void> {
    const key = validateObjectKey(input.key);
    const data =
      typeof input.body === 'string'
        ? input.body
        : Buffer.isBuffer(input.body)
          ? input.body
          : Buffer.from(input.body);

    validateUploadInput({
      key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes ?? byteLength(data),
    });

    await this.bucket.file(key).save(data, {
      resumable: false,
      contentType: input.contentType,
      metadata: {
        cacheControl: input.cacheControl,
        metadata: input.metadata,
      },
    });
  }

  async getObject(key: string): Promise<Buffer> {
    const [data] = await this.bucket.file(validateObjectKey(key)).download();
    return data;
  }

  async deleteObject(key: string): Promise<void> {
    await this.bucket.file(validateObjectKey(key)).delete({ ignoreNotFound: true });
  }

  async getDownloadUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    const [url] = await this.bucket.file(validateObjectKey(key)).getSignedUrl({
      action: 'read',
      expires: signedUrlExpiryDate(options),
      version: this.options.signedUrlVersion ?? 'v4',
    });
    return url;
  }

  async getUploadUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    const validatedKey = validateObjectKey(key);
    const contentType = options.contentType
      ? validateUploadInput({
          key: validatedKey,
          contentType: options.contentType,
          sizeBytes: options.sizeBytes,
        })
      : undefined;
    const [url] = await this.bucket.file(validatedKey).getSignedUrl({
      action: 'write',
      expires: signedUrlExpiryDate(options),
      contentType,
      version: this.options.signedUrlVersion ?? 'v4',
    });
    return url;
  }

  async exists(key: string): Promise<boolean> {
    const [exists] = await this.bucket.file(validateObjectKey(key)).exists();
    return exists;
  }
}

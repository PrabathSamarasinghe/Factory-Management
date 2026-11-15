import { NotImplementedError } from '../errors';
import type { KeyMaterial, KeyProvider } from '../crypto/key-provider';

export interface KmsClientLike {
  encrypt(input: {
    KeyId: string;
    Plaintext: Uint8Array;
  }): Promise<{ CiphertextBlob?: Uint8Array }>;
  decrypt(input: { CiphertextBlob: Uint8Array }): Promise<{ Plaintext?: Uint8Array }>;
}

export interface AwsKmsKeyProviderOptions {
  /** KMS key id/ARN. */
  keyId: string;
  /** Injected AWS KMS client when the AWS migration lands (task 12.1). */
  client?: KmsClientLike;
}

/**
 * Placeholder for the KMS-backed key provider. The current envelope-encryption
 * API expects a raw KEK, so a real implementation must first move wrapping and
 * unwrapping behind KMS operations. This stub keeps the provider boundary and
 * fails closed until then.
 */
export class AwsKmsKeyProvider implements KeyProvider {
  readonly activeKeyId: string;

  constructor(readonly options: AwsKmsKeyProviderOptions) {
    if (!options.keyId) {
      throw new Error('AwsKmsKeyProvider requires a keyId.');
    }
    this.activeKeyId = options.keyId;
  }

  async getActiveKey(): Promise<KeyMaterial> {
    return this.notImplemented();
  }

  async getKey(_keyId: string): Promise<KeyMaterial> {
    return this.notImplemented();
  }

  private notImplemented(): never {
    throw new NotImplementedError(
      'AwsKmsKeyProvider is a stub. Keep EnvKeyProvider until the KMS envelope API is implemented.',
    );
  }
}

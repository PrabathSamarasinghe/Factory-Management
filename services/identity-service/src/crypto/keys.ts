import { generateKeyPairSync, createPublicKey, type KeyObject } from 'node:crypto';

export interface KeyPairInfo {
  kid: string;
  privateKey: string;
  publicKey: string;
  jwk: Record<string, unknown> & { kid: string; alg: string; use: string };
}

export class KeyManager {
  private activeKey: KeyPairInfo;

  constructor() {
    this.activeKey = this.initKeys();
  }

  private initKeys(): KeyPairInfo {
    const envPrivateKey = process.env.JWT_PRIVATE_KEY;
    const envPublicKey = process.env.JWT_PUBLIC_KEY;
    const kid = process.env.JWT_KEY_ID || 'galatura-identity-1';

    if (envPrivateKey && envPublicKey) {
      const pubKeyObj = createPublicKey(envPublicKey);
      const jwkExport = pubKeyObj.export({ format: 'jwk' });
      return {
        kid,
        privateKey: envPrivateKey,
        publicKey: envPublicKey,
        jwk: {
          ...jwkExport,
          kid,
          alg: 'RS256',
          use: 'sig',
        },
      };
    }

    // Generate in-memory 2048-bit RSA key for dev/tests
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const pubKeyObj = createPublicKey(publicKey);
    const jwkExport = pubKeyObj.export({ format: 'jwk' });

    return {
      kid,
      privateKey,
      publicKey,
      jwk: {
        ...jwkExport,
        kid,
        alg: 'RS256',
        use: 'sig',
      },
    };
  }

  getActiveKey(): KeyPairInfo {
    return this.activeKey;
  }

  getJwks(): { keys: Array<Record<string, unknown>> } {
    return {
      keys: [this.activeKey.jwk],
    };
  }
}

import * as Keychain from 'react-native-keychain';
import type { AuthTokens } from '../api/client';

export interface SecureTokenServices {
  access: string;
  refresh: string;
}

const DEFAULT_SERVICES: SecureTokenServices = {
  access: 'com.galatura.mobile.access-token',
  refresh: 'com.galatura.mobile.refresh-token',
};

async function writeToken(service: string, value: string): Promise<void> {
  await Keychain.setGenericPassword('token', value, {
    service,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function readToken(service: string): Promise<string | null> {
  const result = await Keychain.getGenericPassword({ service });
  return result ? result.password : null;
}

export function createSecureTokenStorage(
  services: SecureTokenServices = DEFAULT_SERVICES,
) {
  return {
    async saveTokens(tokens: AuthTokens): Promise<void> {
      await Promise.all([
        writeToken(services.access, tokens.accessToken),
        writeToken(services.refresh, tokens.refreshToken),
      ]);
    },
    async loadTokens(): Promise<AuthTokens | null> {
      const [accessToken, refreshToken] = await Promise.all([
        readToken(services.access),
        readToken(services.refresh),
      ]);
      if (!accessToken || !refreshToken) {
        return null;
      }
      return {
        accessToken,
        refreshToken,
        expiresIn: 900,
        tokenType: 'Bearer',
        mustChangePassword: false,
      };
    },
    async clearTokens(): Promise<void> {
      await Promise.all([
        Keychain.resetGenericPassword({ service: services.access }),
        Keychain.resetGenericPassword({ service: services.refresh }),
      ]);
    },
  };
}

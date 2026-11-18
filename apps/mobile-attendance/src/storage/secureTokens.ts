import * as Keychain from 'react-native-keychain';
import type { AuthTokens } from '../types';

const ACCESS_SERVICE = 'com.galatura.attendance.access-token';
const REFRESH_SERVICE = 'com.galatura.attendance.refresh-token';

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

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await Promise.all([
    writeToken(ACCESS_SERVICE, tokens.accessToken),
    writeToken(REFRESH_SERVICE, tokens.refreshToken),
  ]);
}

export async function loadTokens(): Promise<AuthTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    readToken(ACCESS_SERVICE),
    readToken(REFRESH_SERVICE),
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
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    Keychain.resetGenericPassword({ service: ACCESS_SERVICE }),
    Keychain.resetGenericPassword({ service: REFRESH_SERVICE }),
  ]);
}

import {
  ApiClient,
  createSecureTokenStorage,
  type AuthTokens,
} from '@galatura/mobile-core';
import { getApiBaseUrl } from '../storage/appStorage';

const tokenStorage = createSecureTokenStorage({
  access: 'com.galatura.monitor.access-token',
  refresh: 'com.galatura.monitor.refresh-token',
});

let onSessionExpired: (() => void) | null = null;

export const apiClient = new ApiClient({
  baseUrl: getApiBaseUrl,
  clientApp: 'C7',
  getTokens: () => tokenStorage.loadTokens(),
  setTokens: tokens => tokenStorage.saveTokens(tokens),
  clearTokens: () => tokenStorage.clearTokens(),
  onSessionExpired: () => onSessionExpired?.(),
});

export function configureSessionExpiry(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export async function restoreSession(): Promise<boolean> {
  const tokens = await tokenStorage.loadTokens();
  apiClient.setSessionTokens(tokens);
  return Boolean(tokens);
}

export function hasSession(): boolean {
  return apiClient.hasSession();
}

export async function signIn(
  username: string,
  password: string,
  deviceId: string,
): Promise<AuthTokens> {
  const baseUrl = (await getApiBaseUrl()).replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/identity/auth/login`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-client-app': 'C7',
    },
    body: JSON.stringify({ username, password, deviceId }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message || body?.message || 'Sign-in failed.');
  }
  if (body?.requires2fa) {
    throw new Error('Two-factor sign-in is not supported in C7 monitor.');
  }
  const tokens = body?.tokens as AuthTokens | undefined;
  if (!tokens?.accessToken || !tokens?.refreshToken) {
    throw new Error('The server did not return an access token.');
  }
  apiClient.setSessionTokens(tokens);
  await tokenStorage.saveTokens(tokens);
  return tokens;
}

export async function signOut(): Promise<void> {
  const tokens = apiClient.getSessionTokens();
  try {
    if (tokens?.refreshToken) {
      await apiClient.post('/identity/auth/logout', {
        refreshToken: tokens.refreshToken,
      });
    }
  } catch {
    return;
  } finally {
    apiClient.setSessionTokens(null);
    await tokenStorage.clearTokens();
  }
}

export function decodePermissions(
  accessToken: string | null | undefined,
): string[] {
  if (!accessToken) return [];
  const parts = accessToken.split('.');
  if (parts.length < 2) return [];
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decode = (globalThis as any).atob as
      ((v: string) => string) | undefined;
    const json = decode ? decode(padded) : '';
    const payload = JSON.parse(json);
    const perms = payload?.permissions;
    return Array.isArray(perms) ? perms.map(String) : [];
  } catch {
    return [];
  }
}

import { getApiBaseUrl } from '../storage/appStorage';
import { rememberServerTime } from '../storage/encryptedStore';
import { clearTokens, loadTokens, saveTokens } from '../storage/secureTokens';
import type {
  AuthTokens,
  LoginResult,
  ManualEntryGroup,
  MasterDataSnapshot,
  SyncPullResult,
  SyncPushRequest,
  SyncPushResult,
} from '../types';
import { decodeJwtPayload } from './jwtClaims';

export const CLIENT_APP = 'COLLECTION_MOBILE';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface SessionIdentity {
  userId: string | null;
  permissions: string[];
}

interface RequestOptions {
  permissions?: string[];
  retryOnUnauthorized?: boolean;
}

let tokens: AuthTokens | null = null;
let identity: SessionIdentity = { userId: null, permissions: [] };
let sessionExpiredHandler: (() => void) | null = null;

export function configureSessionExpiry(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

function identityFromTokens(
  value: AuthTokens,
  provided?: Partial<SessionIdentity>,
): SessionIdentity {
  const payload = decodeJwtPayload(value.accessToken);
  const userId =
    provided?.userId ||
    textClaim(payload?.sub) ||
    textClaim(payload?.userId) ||
    null;
  const rawPermissions =
    provided?.permissions ??
    (Array.isArray(payload?.permissions)
      ? payload.permissions.map(permission => String(permission))
      : []);
  return { userId, permissions: [...new Set(rawPermissions.filter(Boolean))] };
}

function textClaim(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resetSession(): void {
  tokens = null;
  identity = { userId: null, permissions: [] };
}

export async function restoreSession(): Promise<boolean> {
  const stored = await loadTokens();
  if (!stored) {
    resetSession();
    return false;
  }
  tokens = stored;
  identity = identityFromTokens(stored);
  return true;
}

export function hasSession(): boolean {
  return Boolean(tokens);
}

export function currentIdentity(): SessionIdentity {
  return identity;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const code = body?.error?.code || body?.code || `HTTP_${response.status}`;
    const message =
      body?.error?.message ||
      body?.message ||
      `Request failed with status ${response.status}.`;
    throw new ApiError(response.status, code, message, body?.error?.details);
  }
  if (body && typeof body === 'object' && typeof body.serverTime === 'string') {
    await rememberServerTime(body.serverTime);
  }
  return body as T;
}

async function applyTokens(
  value: AuthTokens,
  provided?: Partial<SessionIdentity>,
): Promise<void> {
  tokens = value;
  identity = identityFromTokens(value, provided);
  await saveTokens(value);
}

async function refreshTokens(): Promise<boolean> {
  if (!tokens?.refreshToken) {
    return false;
  }
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/identity/auth/refresh`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-client-app': CLIENT_APP,
    },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!response.ok) {
    return false;
  }
  const next = (await parseResponse<AuthTokens>(response)) as AuthTokens;
  await applyTokens(next);
  return true;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  const permissions = [
    ...new Set([...identity.permissions, ...(options.permissions ?? [])]),
  ];
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    accept: 'application/json',
    'x-client-app': CLIENT_APP,
    'x-user-id': identity.userId ?? '',
    'x-permissions': JSON.stringify(permissions),
  };
  if (init.body) {
    headers['content-type'] = 'application/json';
  }
  if (tokens?.accessToken) {
    headers.authorization = `Bearer ${tokens.accessToken}`;
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });

  if (
    response.status === 401 &&
    tokens &&
    options.retryOnUnauthorized !== false
  ) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return request<T>(path, init, { ...options, retryOnUnauthorized: false });
    }
    resetSession();
    await clearTokens();
    sessionExpiredHandler?.();
    throw new ApiError(
      401,
      'UNAUTHORIZED',
      'Your session has expired. Please sign in again.',
    );
  }

  return parseResponse<T>(response);
}

export async function signIn(
  username: string,
  password: string,
  deviceId: string,
): Promise<LoginResult> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/identity/auth/login`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-client-app': CLIENT_APP,
    },
    body: JSON.stringify({ username, password, deviceId }),
  });
  const result = await parseResponse<LoginResult>(response);
  if (result.tokens) {
    await applyTokens(result.tokens, {
      userId: result.userId,
      permissions: result.permissions,
    });
  }
  return result;
}

export async function verifyTwoFactor(
  challengeToken: string,
  code: string,
  deviceId: string,
): Promise<LoginResult> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/identity/auth/2fa/verify`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-client-app': CLIENT_APP,
    },
    body: JSON.stringify({ challengeToken, code, deviceId }),
  });
  const result = await parseResponse<AuthTokens>(response);
  await applyTokens(result);
  return { requires2fa: false, tokens: result };
}

export async function signOut(): Promise<void> {
  try {
    if (tokens) {
      await request('/identity/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    }
  } catch {
    return;
  } finally {
    resetSession();
    await clearTokens();
  }
}

export async function pullMasterData(
  since?: string | null,
): Promise<MasterDataSnapshot> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return request<MasterDataSnapshot>(
    `/collection/master-data/pull${query}`,
    {},
    {
      permissions: ['collection:read'],
    },
  );
}

export async function pushPickups(
  requestBody: SyncPushRequest,
): Promise<SyncPushResult> {
  return request<SyncPushResult>(
    '/collection/sync/push',
    { method: 'POST', body: JSON.stringify(requestBody) },
    { permissions: ['collection:record'] },
  );
}

export async function pullSync(
  since?: string | null,
  limit = 200,
): Promise<SyncPullResult> {
  const parameters = [`limit=${encodeURIComponent(String(limit))}`];
  if (since) {
    parameters.push(`since=${encodeURIComponent(since)}`);
  }
  return request<SyncPullResult>(
    `/collection/sync/pull?${parameters.join('&')}`,
    {},
    {
      permissions: ['collection:record'],
    },
  );
}

export async function fetchManualEntries(
  from?: string,
  to?: string,
): Promise<ManualEntryGroup[]> {
  const parameters: string[] = [];
  if (from) {
    parameters.push(`from=${encodeURIComponent(from)}`);
  }
  if (to) {
    parameters.push(`to=${encodeURIComponent(to)}`);
  }
  const query = parameters.length ? `?${parameters.join('&')}` : '';
  return request<ManualEntryGroup[]>(
    `/collection/reports/manual-entries${query}`,
    {},
    {
      permissions: ['collection:review'],
    },
  );
}

export function isNetworkError(error: unknown): boolean {
  return !(error instanceof ApiError);
}

export function isPermanentApiError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

import { clearTokens, loadTokens, saveTokens } from '../storage/secureTokens';
import { getApiBaseUrl } from '../storage/appStorage';
import type {
  AttendanceDay,
  AuthTokens,
  EnrolResult,
  EnrollmentStatus,
  LoginResult,
  MarkResult,
} from '../types';

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

let tokens: AuthTokens | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function configureSessionExpiry(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

export async function restoreSession(): Promise<boolean> {
  tokens = await loadTokens();
  return Boolean(tokens);
}

export function hasSession(): boolean {
  return Boolean(tokens);
}

export function currentTokens(): AuthTokens | null {
  return tokens;
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
  return body as T;
}

async function refreshTokens(): Promise<boolean> {
  if (!tokens?.refreshToken) {
    return false;
  }
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/identity/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!response.ok) {
    return false;
  }
  const next = (await response.json()) as AuthTokens;
  tokens = next;
  await saveTokens(next);
  return true;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retryOnUnauthorized = true,
): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-client-app': 'ATTENDANCE_MOBILE',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body) {
    headers['content-type'] = 'application/json';
  }
  if (tokens?.accessToken) {
    headers.authorization = `Bearer ${tokens.accessToken}`;
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });

  if (response.status === 401 && tokens && retryOnUnauthorized) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return request<T>(path, init, false);
    }
    tokens = null;
    await clearTokens();
    sessionExpiredHandler?.();
    throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
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
      'x-client-app': 'ATTENDANCE_MOBILE',
    },
    body: JSON.stringify({ username, password, deviceId }),
  });
  const result = await parseResponse<LoginResult>(response);
  if (result.tokens) {
    tokens = result.tokens;
    await saveTokens(result.tokens);
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
      'x-client-app': 'ATTENDANCE_MOBILE',
    },
    body: JSON.stringify({ challengeToken, code, deviceId }),
  });
  const result = await parseResponse<LoginResult>(response);
  if (result.tokens) {
    tokens = result.tokens;
    await saveTokens(result.tokens);
  }
  return result;
}

export async function signOut(): Promise<void> {
  const refreshToken = tokens?.refreshToken;
  try {
    if (tokens) {
      await request('/identity/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch {
    return;
  } finally {
    tokens = null;
    await clearTokens();
  }
}

export async function markAttendance(payload: {
  clientEventId: string;
  personId?: string;
  deviceId?: string;
  locationId?: string;
  imageBase64: string;
  capturedAt: string;
  gpsLat?: number;
  gpsLng?: number;
}): Promise<MarkResult> {
  return request<MarkResult>('/attendance/mark', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function markManual(payload: {
  clientEventId: string;
  personId: string;
  deviceId?: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT';
  eventAt: string;
  reason: string;
}): Promise<MarkResult> {
  return request<MarkResult>('/attendance/mark/manual', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function recordBiometricConsent(personId: string): Promise<void> {
  await request(`/people/persons/${personId}/consents`, {
    method: 'POST',
    body: JSON.stringify({
      consentType: 'BIOMETRIC',
      granted: true,
      evidenceObjectKey: `mobile-consent:${new Date().toISOString()}`,
    }),
  });
}

export async function enrolFace(
  personId: string,
  frames: string[],
): Promise<EnrolResult> {
  return request<EnrolResult>('/attendance/enrollments', {
    method: 'POST',
    body: JSON.stringify({ personId, frames }),
  });
}

export async function enrollmentStatus(personId: string): Promise<EnrollmentStatus> {
  return request<EnrollmentStatus>(`/attendance/enrollments/${personId}/status`);
}

export async function listDays(
  personId: string,
  from: string,
  to: string,
): Promise<AttendanceDay[]> {
  return request<AttendanceDay[]>(
    `/attendance/days?personId=${encodeURIComponent(personId)}&from=${from}&to=${to}`,
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

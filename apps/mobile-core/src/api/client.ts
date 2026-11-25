export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  mustChangePassword: boolean;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  code?: string;
  message?: string;
}

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

export interface ApiClientOptions {
  baseUrl: string | (() => Promise<string> | string);
  clientApp: string;
  getTokens?: () => Promise<AuthTokens | null> | AuthTokens | null;
  setTokens?: (tokens: AuthTokens) => Promise<void> | void;
  clearTokens?: () => Promise<void> | void;
  onSessionExpired?: () => void;
}

export interface RequestOptions extends RequestInit {
  retryOnUnauthorized?: boolean;
}

export interface ListEnvelope<T> {
  data: T;
}

function isListEnvelope<T>(value: unknown): value is ListEnvelope<T> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'data' in (value as Record<string, unknown>) &&
    !('error' in (value as Record<string, unknown>)),
  );
}

export function unwrapList<T>(value: T | ListEnvelope<T>): T {
  if (isListEnvelope<T>(value)) {
    return value.data;
  }
  return value;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const err = body as ApiErrorBody | undefined;
    const code = err?.error?.code || err?.code || `HTTP_${response.status}`;
    const message =
      err?.error?.message ||
      err?.message ||
      `Request failed with status ${response.status}.`;
    throw new ApiError(response.status, code, message, err?.error?.details);
  }
  return body as T;
}

export class ApiClient {
  private tokens: AuthTokens | null = null;

  constructor(private readonly options: ApiClientOptions) {}

  setSessionTokens(tokens: AuthTokens | null): void {
    this.tokens = tokens;
  }

  getSessionTokens(): AuthTokens | null {
    return this.tokens;
  }

  hasSession(): boolean {
    return Boolean(this.tokens?.accessToken);
  }

  private async resolveBaseUrl(): Promise<string> {
    const value =
      typeof this.options.baseUrl === 'function'
        ? await this.options.baseUrl()
        : this.options.baseUrl;
    return value.replace(/\/+$/, '');
  }

  private async resolveTokens(): Promise<AuthTokens | null> {
    if (this.tokens) {
      return this.tokens;
    }
    if (this.options.getTokens) {
      this.tokens = await this.options.getTokens();
    }
    return this.tokens;
  }

  async refreshTokens(): Promise<boolean> {
    const current = await this.resolveTokens();
    if (!current?.refreshToken) {
      return false;
    }
    const baseUrl = await this.resolveBaseUrl();
    const response = await fetch(`${baseUrl}/identity/auth/refresh`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-client-app': this.options.clientApp,
      },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!response.ok) {
      return false;
    }
    const next = (await response.json()) as AuthTokens;
    this.tokens = next;
    await this.options.setTokens?.(next);
    return true;
  }

  async request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const retryOnUnauthorized = init.retryOnUnauthorized !== false;
    const baseUrl = await this.resolveBaseUrl();
    const tokens = await this.resolveTokens();
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-client-app': this.options.clientApp,
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.body !== undefined && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }
    if (tokens?.accessToken) {
      headers.authorization = `Bearer ${tokens.accessToken}`;
    }

    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (response.status === 401 && tokens && retryOnUnauthorized) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        return this.request<T>(path, { ...init, retryOnUnauthorized: false });
      }
      this.tokens = null;
      await this.options.clearTokens?.();
      this.options.onSessionExpired?.();
      throw new ApiError(
        401,
        'UNAUTHORIZED',
        'Your session has expired. Please sign in again.',
      );
    }
    return parseResponse<T>(response);
  }

  async get<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const value = await this.request<T | ListEnvelope<T>>(path, {
      ...init,
      method: 'GET',
    });
    return unwrapList(value);
  }

  async post<T>(
    path: string,
    body?: unknown,
    init: RequestOptions = {},
  ): Promise<T> {
    const value = await this.request<T | ListEnvelope<T>>(path, {
      ...init,
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return unwrapList(value);
  }
}

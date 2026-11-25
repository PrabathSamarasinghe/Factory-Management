export const GENERATED_BY = "tools/clientgen/generate.mjs";

import {
  getOperation,
  renderPath,
  renderQuery,
  type OperationDefinition,
  type OperationId,
} from './operations';

export const DEFAULT_API_BASE_URL = '';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

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
  clientApp?: string;
  token?: string | (() => Promise<string | null> | string | null);
  getTokens?: () => Promise<AuthTokens | null> | AuthTokens | null;
  setTokens?: (tokens: AuthTokens) => Promise<void> | void;
  clearTokens?: () => Promise<void> | void;
  onSessionExpired?: () => void;
  refreshTokenPath?: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

export interface RequestOptions extends RequestInit {
  retryOnUnauthorized?: boolean;
}

export interface ListEnvelope<T> {
  data: T;
}

export interface CallArgs {
  params?: Readonly<Record<string, string | number | boolean>>;
  query?: Readonly<
    Record<
      string,
      | string
      | number
      | boolean
      | null
      | undefined
      | ReadonlyArray<string | number | boolean>
    >
  >;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  retryOnUnauthorized?: boolean;
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
    const errorBody = body as ApiErrorBody | undefined;
    const code = errorBody?.error?.code || errorBody?.code || `HTTP_${response.status}`;
    const message =
      errorBody?.error?.message ||
      errorBody?.message ||
      `Request failed with status ${response.status}.`;
    throw new ApiError(response.status, code, message, errorBody?.error?.details);
  }
  return body as T;
}

async function resolveValue<T>(value: T | (() => T)): Promise<T> {
  return typeof value === 'function' ? (value as () => T)() : value;
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
    const value = await resolveValue(this.options.baseUrl);
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

  private fetchImpl(): (input: string, init?: RequestInit) => Promise<Response> {
    if (this.options.fetch) {
      return this.options.fetch;
    }
    if (typeof fetch === 'function') {
      return (input, init) => fetch(input, init);
    }
    throw new Error('No fetch implementation is available.');
  }

  async refreshTokens(): Promise<boolean> {
    const current = await this.resolveTokens();
    if (!current?.refreshToken) {
      return false;
    }
    const response = await this.fetchImpl()(
      `${await this.resolveBaseUrl()}${this.options.refreshTokenPath ?? '/identity/auth/refresh'}`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(this.options.clientApp ? { 'x-client-app': this.options.clientApp } : {}),
        },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      },
    );
    if (!response.ok) {
      return false;
    }
    const next = (await parseResponse<AuthTokens>(response)) as AuthTokens;
    this.tokens = next;
    await this.options.setTokens?.(next);
    return true;
  }

  async request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const retryOnUnauthorized = init.retryOnUnauthorized !== false;
    const baseUrl = await this.resolveBaseUrl();
    const tokens = await this.resolveTokens();
    const explicitToken = this.options.token ? await resolveValue(this.options.token) : null;
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(this.options.clientApp ? { 'x-client-app': this.options.clientApp } : {}),
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    if (init.body !== undefined && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }
    const bearer = explicitToken || tokens?.accessToken;
    if (bearer) {
      headers.authorization = `Bearer ${bearer}`;
    }

    const response = await this.fetchImpl()(`${baseUrl}${path}`, { ...init, headers });
    if (response.status === 401 && retryOnUnauthorized && (tokens?.refreshToken || explicitToken)) {
      const refreshed = tokens?.refreshToken ? await this.refreshTokens() : false;
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
    return unwrapList(
      await this.request<T | ListEnvelope<T>>(path, { ...init, method: 'GET' }),
    );
  }

  async post<T>(path: string, body?: unknown, init: RequestOptions = {}): Promise<T> {
    return unwrapList(
      await this.request<T | ListEnvelope<T>>(path, {
        ...init,
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  }

  async put<T>(path: string, body?: unknown, init: RequestOptions = {}): Promise<T> {
    return unwrapList(
      await this.request<T | ListEnvelope<T>>(path, {
        ...init,
        method: 'PUT',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  }

  async patch<T>(path: string, body?: unknown, init: RequestOptions = {}): Promise<T> {
    return unwrapList(
      await this.request<T | ListEnvelope<T>>(path, {
        ...init,
        method: 'PATCH',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  }

  async delete<T>(path: string, init: RequestOptions = {}): Promise<T> {
    return unwrapList(
      await this.request<T | ListEnvelope<T>>(path, { ...init, method: 'DELETE' }),
    );
  }

  async call<T = unknown>(
    operation: OperationId | OperationDefinition,
    args: CallArgs = {},
  ): Promise<T> {
    const definition = typeof operation === 'string' ? getOperation(operation) : operation;
    if (!definition) {
      throw new Error('Unknown operation.');
    }
    if (definition.method === 'GET' && args.body !== undefined) {
      throw new Error(`${definition.operationId} does not accept a request body.`);
    }
    const path = `${renderPath(definition, args.params)}${renderQuery(definition, args.query)}`;
    const headers = { ...(args.headers ?? {}) };
    const init: RequestOptions = {
      method: definition.method,
      headers,
      retryOnUnauthorized: args.retryOnUnauthorized,
    };
    if (args.body !== undefined) {
      init.body = JSON.stringify(args.body);
    }
    return unwrapList(await this.request<T | ListEnvelope<T>>(path, init));
  }
}


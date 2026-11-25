import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const GENERATOR = 'tools/clientgen/generate.mjs';
const SPEC_DIR = ['packages', 'contracts', 'openapi'];

export const GENERATED_PATHS = Object.freeze({
  tsClient: 'packages/api-client-ts/src/client.ts',
  tsIndex: 'packages/api-client-ts/src/index.ts',
  tsOperations: 'packages/api-client-ts/src/operations.ts',
  pythonClient: 'packages/api-client-python/galatura_api_client/client.py',
  pythonInit: 'packages/api-client-python/galatura_api_client/__init__.py',
  pythonOperations: 'packages/api-client-python/galatura_api_client/operations.py',
});

export function readOpenApiSpecs(root) {
  const rootPath = resolveRoot(root);
  const specsDir = joinPath(rootPath, ...SPEC_DIR);
  if (!existsSync(specsDir) || !statSync(specsDir).isDirectory()) {
    throw new Error(`Missing OpenAPI directory: ${relativePath(rootPath, specsDir)}.`);
  }
  const names = readdirSync(specsDir)
    .filter((name) => name.endsWith('.json') && name !== 'index.json')
    .sort(compareStrings);
  return names.map((name) => {
    const path = joinPath(specsDir, name);
    const spec = JSON.parse(readFileSync(path, 'utf8'));
    if (!spec || typeof spec !== 'object' || !spec.paths || typeof spec.paths !== 'object') {
      throw new Error(`${relativePath(rootPath, path)} has no paths object.`);
    }
    return { name: basename(name, '.json'), spec };
  });
}

export function collectOperations(entry) {
  const { name, spec } = entry;
  const basePath = serverPath(spec, name);
  const serviceRoute = gatewayRoute(basePath, name);
  const operations = [];

  for (const [specPath, pathItem] of Object.entries(spec.paths).sort(([left], [right]) =>
    compareStrings(left, right),
  )) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }
    for (const [rawMethod, definition] of Object.entries(pathItem)) {
      const method = rawMethod.toUpperCase();
      if (!HTTP_METHODS.includes(method) || !definition || typeof definition !== 'object') {
        continue;
      }
      if (typeof definition.operationId !== 'string' || !definition.operationId) {
        throw new Error(`${name} ${method} ${specPath} has no operationId.`);
      }
      const parameters = [...(Array.isArray(pathItem.parameters) ? pathItem.parameters : [])]
        .concat(Array.isArray(definition.parameters) ? definition.parameters : [])
        .filter((parameter) => parameter && typeof parameter.name === 'string')
        .map((parameter) => ({
          name: parameter.name,
          location: ['path', 'query', 'header'].includes(parameter.in) ? parameter.in : 'query',
          required: parameter.required === true,
        }));
      operations.push({
        service: name,
        operationId: definition.operationId,
        method,
        path: joinRoute(serviceRoute, specPath),
        specPath,
        basePath,
        parameters: dedupeParameters(parameters).sort((left, right) => {
          const byLocation = compareStrings(left.location, right.location);
          return byLocation === 0 ? compareStrings(left.name, right.name) : byLocation;
        }),
        hasBody: definition.requestBody !== undefined,
      });
    }
  }

  return operations;
}

export function buildOperationModel(entries) {
  const operations = entries.flatMap(collectOperations);
  const byId = new Map();
  for (const operation of operations) {
    if (byId.has(operation.operationId)) {
      throw new Error(`Duplicate operationId ${operation.operationId}.`);
    }
    byId.set(operation.operationId, operation);
  }
  return operations.sort((left, right) => compareStrings(left.operationId, right.operationId));
}

export function renderTypeScriptClient() {
  return `${tsTemplate()}\n`;
}

export function renderTypeScriptIndex() {
  return [
    `export const GENERATED_BY = ${JSON.stringify(GENERATOR)};`,
    "export * from './client';",
    "export * from './operations';",
    '',
  ].join('\n');
}

export function renderTypeScriptOperations(operations) {
  const lines = [
    `export const GENERATED_BY = ${JSON.stringify(GENERATOR)};`,
    '',
    'export type OperationParameterLocation = "path" | "query" | "header";',
    '',
    'export interface OperationParameter {',
    '  readonly name: string;',
    '  readonly location: OperationParameterLocation;',
    '  readonly required: boolean;',
    '}',
    '',
    'export interface OperationDefinition {',
    '  readonly service: string;',
    '  readonly operationId: string;',
    '  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";',
    '  readonly path: string;',
    '  readonly specPath: string;',
    '  readonly basePath: string;',
    '  readonly parameters: readonly OperationParameter[];',
    '  readonly hasBody: boolean;',
    '}',
    '',
    'export const OPERATION_IDS = [',
    ...operations.map((operation) => `  ${JSON.stringify(operation.operationId)},`),
    '] as const;',
    '',
    'export type OperationId = (typeof OPERATION_IDS)[number];',
    '',
    'export const OPERATIONS: readonly OperationDefinition[] = [',
    ...operations.map((operation) => `  ${formatTsOperation(operation)},`),
    '];',
    '',
    'export const OPERATIONS_BY_ID: Record<OperationId, OperationDefinition> =',
    '  Object.fromEntries(OPERATIONS.map(operation => [operation.operationId, operation])) as',
    '    Record<OperationId, OperationDefinition>;',
    '',
  ];

  const services = [...new Set(operations.map((operation) => operation.service))].sort(
    compareStrings,
  );
  for (const service of services) {
    lines.push(
      `export const ${constantName(service)}_OPERATIONS: readonly OperationDefinition[] = [`,
      ...operations
        .filter((operation) => operation.service === service)
        .map((operation) => `  ${formatTsOperation(operation)},`),
      '];',
      '',
    );
  }

  lines.push(
    'export const OPERATIONS_BY_SERVICE: Readonly<Record<string, readonly OperationDefinition[]>> = {',
    ...services.map(
      (service) => `  ${JSON.stringify(service)}: ${constantName(service)}_OPERATIONS,`,
    ),
    '};',
    '',
    'export function getOperation(operationId: OperationId): OperationDefinition {',
    '  return OPERATIONS_BY_ID[operationId];',
    '}',
    '',
    'export function renderPath(',
    '  operation: OperationDefinition,',
    '  params: Readonly<Record<string, string | number | boolean>> = {},',
    '): string {',
    '  return operation.path.replace(/\\{([^}]+)\\}/g, (_match: string, name: string) => {',
    '    const value = params[name];',
    '    if (value === undefined || value === null) {',
    '      throw new Error(`Missing path parameter ${name} for ${operation.operationId}.`);',
    '    }',
    '    return encodeURIComponent(String(value));',
    '  });',
    '}',
    '',
    'export function renderQuery(',
    '  operation: OperationDefinition,',
    '  query: Readonly<Record<string, QueryValue>> = {},',
    '): string {',
    '  const parts: string[] = [];',
    '  for (const parameter of operation.parameters) {',
    '    if (parameter.location !== "query") {',
    '      continue;',
    '    }',
    '    const value = query[parameter.name];',
    '    if (value === undefined || value === null) {',
    '      continue;',
    '    }',
    '    const values = Array.isArray(value) ? value : [value];',
    '    for (const item of values) {',
    '      parts.push(`${encodeURIComponent(parameter.name)}=${encodeURIComponent(String(item))}`);',
    '    }',
    '  }',
    '  return parts.length === 0 ? "" : `?${parts.join("&")}`;',
    '}',
    '',
    'type QueryValue =',
    '  | string',
    '  | number',
    '  | boolean',
    '  | null',
    '  | undefined',
    '  | ReadonlyArray<string | number | boolean>;',
    '',
  );
  return lines.join('\n');
}

export function renderPythonClient() {
  return `${pythonTemplate()}\n`;
}

export function renderPythonOperations(operations) {
  const lines = [
    `${pythonGeneratedHeader()}`,
    '',
    'import urllib.parse',
    'from dataclasses import dataclass',
    'from typing import Any, Dict, Mapping, Tuple',
    '',
    '@dataclass(frozen=True)',
    'class OperationParameter:',
    '    name: str',
    '    location: str',
    '    required: bool',
    '',
    '@dataclass(frozen=True)',
    'class Operation:',
    '    service: str',
    '    operation_id: str',
    '    method: str',
    '    path: str',
    '    spec_path: str',
    '    base_path: str',
    '    parameters: Tuple[OperationParameter, ...]',
    '    has_body: bool',
    '',
    'OPERATIONS: Tuple[Operation, ...] = (',
    ...operations.map((operation) => `    ${formatPythonOperation(operation)},`),
    ')',
    '',
    'OPERATIONS_BY_ID: Dict[str, Operation] = {operation.operation_id: operation for operation in OPERATIONS}',
    '',
  ];
  const services = [...new Set(operations.map((operation) => operation.service))].sort(
    compareStrings,
  );
  for (const service of services) {
    lines.push(
      `${constantName(service)}_OPERATIONS: Tuple[Operation, ...] = (`,
      ...operations
        .filter((operation) => operation.service === service)
        .map((operation) => `    ${formatPythonOperation(operation)},`),
      ')',
      '',
    );
  }
  lines.push(
    'OPERATIONS_BY_SERVICE: Dict[str, Tuple[Operation, ...]] = {',
    ...services.map(
      (service) => `    ${JSON.stringify(service)}: ${constantName(service)}_OPERATIONS,`,
    ),
    '}',
    '',
    '',
    'def get_operation(operation_id: str) -> Operation:',
    '    return OPERATIONS_BY_ID[operation_id]',
    '',
    '',
    'def render_path(operation: Operation, params: Mapping[str, Any]) -> str:',
    '    result = operation.path',
    '    for parameter in operation.parameters:',
    '        if parameter.location != "path":',
    '            continue',
    '        if parameter.name not in params or params[parameter.name] is None:',
    '            raise ValueError(',
    '                f"Missing path parameter {parameter.name} for {operation.operation_id}."',
    '            )',
    '        value = urllib.parse.quote(str(params[parameter.name]), safe="")',
    '        result = result.replace("{" + parameter.name + "}", value)',
    '    return result',
    '',
    '',
    'def render_query(operation: Operation, query: Mapping[str, Any]) -> str:',
    '    parts = []',
    '    for parameter in operation.parameters:',
    '        if parameter.location != "query" or parameter.name not in query:',
    '            continue',
    '        value = query[parameter.name]',
    '        if value is None:',
    '            continue',
    '        values = value if isinstance(value, (list, tuple)) else [value]',
    '        for item in values:',
    '            encoded_key = urllib.parse.quote(parameter.name, safe="")',
    '            encoded_value = urllib.parse.quote(str(item), safe="")',
    '            parts.append(f"{encoded_key}={encoded_value}")',
    '    return "?" + "&".join(parts) if parts else ""',
    '',
  );
  return lines.join('\n');
}

export function renderPythonInit() {
  return [
    pythonGeneratedHeader(),
    '',
    'from .client import ApiClient, ApiError, AuthTokens, DEFAULT_API_BASE_URL',
    'from .operations import OPERATIONS, OPERATIONS_BY_ID, OPERATIONS_BY_SERVICE, Operation',
    '',
    '__all__ = [',
    '    "ApiClient",',
    '    "ApiError",',
    '    "AuthTokens",',
    '    "DEFAULT_API_BASE_URL",',
    '    "OPERATIONS",',
    '    "OPERATIONS_BY_ID",',
    '    "OPERATIONS_BY_SERVICE",',
    '    "Operation",',
    ']',
    '',
  ].join('\n');
}

export function buildClientFiles(root) {
  const operations = buildOperationModel(readOpenApiSpecs(root));
  return new Map([
    [GENERATED_PATHS.tsIndex, renderTypeScriptIndex()],
    [GENERATED_PATHS.tsClient, renderTypeScriptClient()],
    [GENERATED_PATHS.tsOperations, renderTypeScriptOperations(operations)],
    [GENERATED_PATHS.pythonInit, renderPythonInit()],
    [GENERATED_PATHS.pythonClient, renderPythonClient()],
    [GENERATED_PATHS.pythonOperations, renderPythonOperations(operations)],
  ]);
}

function formatTsOperation(operation) {
  const parameters = operation.parameters
    .map(
      (parameter) =>
        `{ name: ${JSON.stringify(parameter.name)}, location: ${JSON.stringify(
          parameter.location,
        )}, required: ${parameter.required} }`,
    )
    .join(', ');
  return [
    '{',
    `service: ${JSON.stringify(operation.service)},`,
    `operationId: ${JSON.stringify(operation.operationId)},`,
    `method: ${JSON.stringify(operation.method)},`,
    `path: ${JSON.stringify(operation.path)},`,
    `specPath: ${JSON.stringify(operation.specPath)},`,
    `basePath: ${JSON.stringify(operation.basePath)},`,
    `parameters: [${parameters}],`,
    `hasBody: ${operation.hasBody}`,
    '}',
  ].join(' ');
}

function formatPythonOperation(operation) {
  const parameters = operation.parameters
    .map(
      (parameter) =>
        `OperationParameter(name=${JSON.stringify(parameter.name)}, location=${JSON.stringify(
          parameter.location,
        )}, required=${parameter.required ? 'True' : 'False'})`,
    )
    .join(', ');
  return [
    'Operation(',
    `service=${JSON.stringify(operation.service)},`,
    `operation_id=${JSON.stringify(operation.operationId)},`,
    `method=${JSON.stringify(operation.method)},`,
    `path=${JSON.stringify(operation.path)},`,
    `spec_path=${JSON.stringify(operation.specPath)},`,
    `base_path=${JSON.stringify(operation.basePath)},`,
    `parameters=(${parameters}),`,
    `has_body=${operation.hasBody ? 'True' : 'False'},`,
    ')',
  ].join('');
}

function dedupeParameters(parameters) {
  const seen = new Set();
  return parameters.filter((parameter) => {
    const key = `${parameter.location}:${parameter.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function serverPath(spec, name) {
  const url = spec.servers?.[0]?.url;
  if (typeof url !== 'string' || !url) {
    return `/api/v1/${name}`;
  }
  try {
    return new URL(url).pathname.replace(/\/+$/, '') || `/api/v1/${name}`;
  } catch {
    return url.replace(/\/+$/, '') || `/api/v1/${name}`;
  }
}

function gatewayRoute(basePath, name) {
  const stripped = basePath.replace(/^\/api\/v\d+/, '');
  return stripped || `/${name}`;
}

function joinRoute(prefix, path) {
  const segments = `${prefix}/${path}`.split('/').filter((segment) => segment.length > 0);
  return `/${segments.join('/')}`;
}

function constantName(value) {
  return value.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}

function resolveRoot(root) {
  const path = resolve(String(root ?? process.cwd()));
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`--root must be an existing directory: ${path}`);
  }
  return path;
}

function relativePath(rootPath, path) {
  return relative(rootPath, path).split(sep).join('/');
}

function joinPath(...parts) {
  return join(...parts);
}

function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function pythonGeneratedHeader() {
  return `__generated_by__ = ${JSON.stringify(GENERATOR)}`;
}

function tsTemplate() {
  return `export const GENERATED_BY = ${JSON.stringify(GENERATOR)};

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
    const code = errorBody?.error?.code || errorBody?.code || \`HTTP_\${response.status}\`;
    const message =
      errorBody?.error?.message ||
      errorBody?.message ||
      \`Request failed with status \${response.status}.\`;
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
    return value.replace(/\\/+$/, '');
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
      \`\${await this.resolveBaseUrl()}\${this.options.refreshTokenPath ?? '/identity/auth/refresh'}\`,
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
      headers.authorization = \`Bearer \${bearer}\`;
    }

    const response = await this.fetchImpl()(\`\${baseUrl}\${path}\`, { ...init, headers });
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
      throw new Error(\`\${definition.operationId} does not accept a request body.\`);
    }
    const path = \`\${renderPath(definition, args.params)}\${renderQuery(definition, args.query)}\`;
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
`;
}

function pythonTemplate() {
  return `${pythonGeneratedHeader()}

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Dict, Mapping, Optional, Tuple, Union

from .operations import Operation, get_operation, render_path, render_query

DEFAULT_API_BASE_URL = ""

TokenSource = Union[str, None, Callable[[], Optional[str]]]
TokensSource = Union[
    "AuthTokens",
    None,
    Callable[[], Optional["AuthTokens"]],
]


@dataclass(frozen=True)
class AuthTokens:
    accessToken: str
    refreshToken: str
    expiresIn: int
    tokenType: str
    mustChangePassword: bool


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details


def _resolve(value: Any) -> Any:
    return value() if callable(value) else value


def _error_from(status: int, body: Any) -> ApiError:
    if not isinstance(body, dict):
        return ApiError(status, f"HTTP_{status}", f"Request failed with status {status}.")
    error = body.get("error") if isinstance(body.get("error"), dict) else {}
    code = error.get("code") or body.get("code") or f"HTTP_{status}"
    message = (
        error.get("message")
        or body.get("message")
        or f"Request failed with status {status}."
    )
    return ApiError(status, str(code), str(message), error.get("details"))


class ApiClient:
    def __init__(
        self,
        base_url: Union[str, Callable[[], str]] = DEFAULT_API_BASE_URL,
        client_app: Optional[str] = None,
        token: TokenSource = None,
        tokens: TokensSource = None,
        set_tokens: Optional[Callable[[AuthTokens], None]] = None,
        clear_tokens: Optional[Callable[[], None]] = None,
        on_session_expired: Optional[Callable[[], None]] = None,
        refresh_token_path: str = "/identity/auth/refresh",
    ) -> None:
        self.base_url = base_url
        self.client_app = client_app
        self.token = token
        self._tokens: Optional[AuthTokens] = None
        self.tokens = tokens
        self.set_tokens = set_tokens
        self.clear_tokens = clear_tokens
        self.on_session_expired = on_session_expired
        self.refresh_token_path = refresh_token_path

    def set_session_tokens(self, tokens: Optional[AuthTokens]) -> None:
        self._tokens = tokens

    def get_session_tokens(self) -> Optional[AuthTokens]:
        return self._tokens

    def has_session(self) -> bool:
        return bool(self._tokens and self._tokens.accessToken)

    def _base_url(self) -> str:
        return str(_resolve(self.base_url)).rstrip("/")

    def _current_tokens(self) -> Optional[AuthTokens]:
        if self._tokens is None:
            self._tokens = _resolve(self.tokens)
        return self._tokens

    def _headers(self, body_present: bool, headers: Optional[Mapping[str, str]]) -> Dict[str, str]:
        result = {"accept": "application/json"}
        if self.client_app:
            result["x-client-app"] = self.client_app
        if headers:
            result.update(dict(headers))
        if body_present and "content-type" not in result:
            result["content-type"] = "application/json"
        bearer = _resolve(self.token) or (
            self._current_tokens().accessToken if self._current_tokens() else None
        )
        if bearer:
            result["authorization"] = f"Bearer {bearer}"
        return result

    def refresh_tokens(self) -> bool:
        current = self._current_tokens()
        if not current or not current.refreshToken:
            return False
        response = self.request(
            "POST",
            self.refresh_token_path,
            body={"refreshToken": current.refreshToken},
            retry_on_unauthorized=False,
        )
        if not isinstance(response, dict) or not response.get("accessToken"):
            return False
        next_tokens = AuthTokens(
            accessToken=str(response["accessToken"]),
            refreshToken=str(response.get("refreshToken") or current.refreshToken),
            expiresIn=int(response.get("expiresIn") or 900),
            tokenType=str(response.get("tokenType") or "Bearer"),
            mustChangePassword=bool(response.get("mustChangePassword")),
        )
        self._tokens = next_tokens
        if self.set_tokens:
            self.set_tokens(next_tokens)
        return True

    def request(
        self,
        method: str,
        path: str,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
        retry_on_unauthorized: bool = True,
    ) -> Any:
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            f"{self._base_url()}{path}",
            data=data,
            method=method.upper(),
            headers=self._headers(data is not None, headers),
        )
        try:
            with urllib.request.urlopen(request) as response:
                raw = response.read()
                if not raw:
                    return None
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as error:
            raw = error.read()
            parsed: Any = None
            if raw:
                try:
                    parsed = json.loads(raw.decode("utf-8"))
                except ValueError:
                    parsed = None
            if error.code == 401 and retry_on_unauthorized and self._current_tokens():
                if self.refresh_tokens():
                    return self.request(method, path, body, headers, False)
                self._tokens = None
                if self.clear_tokens:
                    self.clear_tokens()
                if self.on_session_expired:
                    self.on_session_expired()
                raise ApiError(401, "UNAUTHORIZED", "Your session has expired. Please sign in again.")
            raise _error_from(error.code, parsed)
        except urllib.error.URLError as error:
            raise ApiError(0, "NETWORK_ERROR", str(error.reason))

    def get(self, path: str, headers: Optional[Mapping[str, str]] = None) -> Any:
        return self.request("GET", path, headers=headers)

    def post(
        self,
        path: str,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        return self.request("POST", path, body, headers)

    def put(
        self,
        path: str,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        return self.request("PUT", path, body, headers)

    def patch(
        self,
        path: str,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        return self.request("PATCH", path, body, headers)

    def delete(self, path: str, headers: Optional[Mapping[str, str]] = None) -> Any:
        return self.request("DELETE", path, headers=headers)

    def call(
        self,
        operation: Union[str, Operation],
        params: Optional[Mapping[str, Any]] = None,
        query: Optional[Mapping[str, Any]] = None,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        definition = get_operation(operation) if isinstance(operation, str) else operation
        if definition.method == "GET" and body is not None:
            raise ValueError(f"{definition.operation_id} does not accept a request body.")
        path = f"{render_path(definition, params or {})}{render_query(definition, query or {})}"
        return self.request(definition.method, path, body, headers)
`;
}

import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { from, of, switchMap, map, type Observable } from 'rxjs';
import { IdempotencyKeyReusedError, ValidationError } from '../errors';
import { canonicalStringify } from '../json';
import { sha256Hex } from '../crypto';

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  statusCode: number;
  responseBody: unknown;
  createdAt: string;
  expiresAt: string;
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(record: IdempotencyRecord): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async get(key: string): Promise<IdempotencyRecord | null> {
    const record = this.records.get(key);
    if (!record) {
      return null;
    }
    if (Date.parse(record.expiresAt) <= this.clock().getTime()) {
      this.records.delete(key);
      return null;
    }
    return record;
  }

  async set(record: IdempotencyRecord): Promise<void> {
    this.records.set(record.key, record);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

export interface IdempotencyOptions {
  /** Header holding the client key. Default `idempotency-key`. */
  headerName?: string;
  ttlMs?: number;
  /** Reject requests without a key. Default true. */
  requireKey?: boolean;
  clock?: () => Date;
}

interface IdempotentRequest {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface IdempotentResponse {
  statusCode?: number;
  status?: (code: number) => unknown;
}

export function idempotencyKeyFrom(
  headers: Record<string, string | string[] | undefined> | undefined,
  options: Pick<IdempotencyOptions, 'headerName'> = {},
): string | null {
  const name = (options.headerName ?? 'idempotency-key').toLowerCase();
  const raw = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function hashRequest(method: string, path: string, body: unknown): string {
  return sha256Hex(canonicalStringify({ method: method.toUpperCase(), path, body: body ?? null }));
}

export class IdempotencyInterceptor implements NestInterceptor {
  private readonly ttlMs: number;
  private readonly requireKey: boolean;
  private readonly clock: () => Date;

  constructor(
    private readonly store: IdempotencyStore,
    private readonly options: IdempotencyOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60_000;
    this.requireKey = options.requireKey ?? true;
    this.clock = options.clock ?? (() => new Date());
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<IdempotentRequest>();
    const key = idempotencyKeyFrom(request.headers, this.options);

    if (!key) {
      if (this.requireKey) {
        throw new ValidationError('Missing Idempotency-Key header.');
      }
      return next.handle();
    }

    const requestHash = hashRequest(
      request.method ?? 'GET',
      request.originalUrl ?? request.url ?? '',
      request.body,
    );

    const existing = await this.store.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyKeyReusedError();
      }
      this.applyStatus(context, existing.statusCode);
      return of(existing.responseBody);
    }

    return next
      .handle()
      .pipe(
        switchMap((body) => from(this.save(key, requestHash, context, body)).pipe(map(() => body))),
      );
  }

  private async save(
    key: string,
    requestHash: string,
    context: ExecutionContext,
    body: unknown,
  ): Promise<void> {
    const response = context.switchToHttp().getResponse<IdempotentResponse>();
    const now = this.clock();
    await this.store.set({
      key,
      requestHash,
      statusCode: typeof response.statusCode === 'number' ? response.statusCode : 200,
      responseBody: body ?? null,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
    });
  }

  private applyStatus(context: ExecutionContext, statusCode: number): void {
    const response = context.switchToHttp().getResponse<IdempotentResponse>();
    if (typeof response.status === 'function') {
      response.status(statusCode);
    }
  }
}

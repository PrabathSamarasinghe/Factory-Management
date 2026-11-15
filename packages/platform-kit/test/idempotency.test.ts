import { firstValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  IdempotencyInterceptor,
  IdempotencyKeyReusedError,
  InMemoryIdempotencyStore,
  ValidationError,
  hashRequest,
  idempotencyKeyFrom,
} from '../src';

interface MockResponse {
  statusCode: number;
  status(code: number): MockResponse;
}

function makeContext(request: Record<string, unknown>, response: MockResponse): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => () => undefined,
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

function nextWith(body: unknown): CallHandler {
  return { handle: () => of(body) };
}

function makeResponse(statusCode = 201): MockResponse {
  const response: MockResponse = {
    statusCode,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
  };
  return response;
}

describe('idempotency keys', () => {
  it('reads the header case-insensitively', () => {
    expect(idempotencyKeyFrom({ 'Idempotency-Key': 'abc' })).toBe('abc');
    expect(idempotencyKeyFrom({ 'idempotency-key': ['abc', 'def'] })).toBe('abc');
    expect(idempotencyKeyFrom({ 'x-request-id': 'abc' })).toBeNull();
    expect(idempotencyKeyFrom({ 'idempotency-key': '  ' })).toBeNull();
  });

  it('hashes requests deterministically regardless of key order', () => {
    expect(hashRequest('post', '/collections', { b: 2, a: 1 })).toBe(
      hashRequest('POST', '/collections', { a: 1, b: 2 }),
    );
    expect(hashRequest('POST', '/collections', { a: 1 })).not.toBe(
      hashRequest('POST', '/collections', { a: 2 }),
    );
  });
});

describe('IdempotencyInterceptor', () => {
  it('stores the first response and replays it', async () => {
    const store = new InMemoryIdempotencyStore();
    const interceptor = new IdempotencyInterceptor(store);
    const request = {
      method: 'POST',
      url: '/collections',
      headers: { 'Idempotency-Key': 'key-1' },
      body: { b: 2, a: 1 },
    };
    const response = makeResponse(201);
    const body = { id: 'collection-1' };

    const first = await firstValueFrom(
      await interceptor.intercept(makeContext(request, response), nextWith(body)),
    );
    expect(first).toEqual(body);
    await expect(store.get('key-1')).resolves.toMatchObject({
      statusCode: 201,
      requestHash: hashRequest('POST', '/collections', { a: 1, b: 2 }),
    });

    response.statusCode = 200;
    const replay = await firstValueFrom(
      await interceptor.intercept(
        makeContext(
          {
            ...request,
            headers: { 'idempotency-key': 'key-1' },
            body: { a: 1, b: 2 },
          },
          response,
        ),
        nextWith({ id: 'collection-2' }),
      ),
    );

    expect(replay).toEqual(body);
    expect(response.statusCode).toBe(201);
  });

  it('rejects reuse of a key with a different request', async () => {
    const interceptor = new IdempotencyInterceptor(new InMemoryIdempotencyStore());
    const response = makeResponse();
    const request = {
      method: 'POST',
      url: '/collections',
      headers: { 'idempotency-key': 'key-1' },
      body: { a: 1 },
    };

    await firstValueFrom(
      await interceptor.intercept(makeContext(request, response), nextWith({ ok: true })),
    );

    await expect(
      interceptor.intercept(
        makeContext({ ...request, body: { a: 2 } }, response),
        nextWith({ ok: true }),
      ),
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
  });

  it('requires a key by default and can be made optional', async () => {
    const store = new InMemoryIdempotencyStore();
    const interceptor = new IdempotencyInterceptor(store);
    const request = { method: 'POST', url: '/collections', headers: {}, body: { a: 1 } };

    await expect(
      interceptor.intercept(makeContext(request, makeResponse()), nextWith({ ok: true })),
    ).rejects.toBeInstanceOf(ValidationError);

    const optional = new IdempotencyInterceptor(store, { requireKey: false });
    const body = { ok: true };
    await expect(
      firstValueFrom(
        await optional.intercept(makeContext(request, makeResponse()), nextWith(body)),
      ),
    ).resolves.toEqual(body);
    await expect(store.get('key-1')).resolves.toBeNull();
  });

  it('does not store failed responses', async () => {
    const store = new InMemoryIdempotencyStore();
    const interceptor = new IdempotencyInterceptor(store);
    const request = {
      method: 'POST',
      url: '/collections',
      headers: { 'idempotency-key': 'key-1' },
      body: { a: 1 },
    };
    const failing: CallHandler = {
      handle: () => {
        throw new Error('handler failed');
      },
    };

    await expect(
      interceptor.intercept(makeContext(request, makeResponse()), failing),
    ).rejects.toThrow('handler failed');
    await expect(store.get('key-1')).resolves.toBeNull();
  });

  it('expires stored responses', async () => {
    let now = 0;
    const store = new InMemoryIdempotencyStore(() => new Date(now));
    await store.set({
      key: 'k',
      requestHash: 'hash',
      statusCode: 200,
      responseBody: {},
      createdAt: new Date(0).toISOString(),
      expiresAt: new Date(1_000).toISOString(),
    });

    await expect(store.get('k')).resolves.not.toBeNull();
    now = 1_000;
    await expect(store.get('k')).resolves.toBeNull();
  });
});

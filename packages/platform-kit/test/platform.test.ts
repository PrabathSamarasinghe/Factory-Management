import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  canonicalStringify,
  createLogger,
  isSensitiveKey,
  isSensitiveValue,
  isUuid,
  redactObject,
  redactValue,
  uuidv7,
} from '../src';

describe('ids', () => {
  it('generates unique, time-ordered UUIDv7 values', () => {
    const ids = Array.from({ length: 100 }, () => uuidv7());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isUuid)).toBe(true);
    expect(ids[0] < ids[99]).toBe(true);
  });

  it('rejects non-UUID values', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('canonical JSON', () => {
  it('sorts keys and omits undefined', () => {
    expect(canonicalStringify({ b: 2, a: 1, c: undefined })).toBe('{"a":1,"b":2}');
    expect(canonicalStringify({ b: { d: 4, c: 3 }, a: [1, 2] })).toBe(
      '{"a":[1,2],"b":{"c":3,"d":4}}',
    );
  });

  it('serialises dates and buffers', () => {
    const date = new Date('2026-11-15T00:00:00.000Z');
    expect(canonicalStringify({ date })).toBe('{"date":"2026-11-15T00:00:00.000Z"}');
    expect(canonicalStringify({ buffer: Buffer.from('hi') })).toBe('{"buffer":"aGk="}');
  });

  it('throws on circular structures', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => canonicalStringify(value)).toThrow(/circular/i);
  });
});

describe('redaction', () => {
  it('recognises sensitive keys and values', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('authorization')).toBe(true);
    expect(isSensitiveKey('nicNumber')).toBe(true);
    expect(isSensitiveKey('totalNetKg')).toBe(false);
    expect(isSensitiveValue('Bearer abc.def')).toBe(true);
    expect(isSensitiveValue('normal text')).toBe(false);
  });

  it('redacts nested sensitive keys without mutating input', () => {
    const input = {
      username: 'kasun',
      password: 'secret',
      nested: { token: 'abc', amount: 10 },
    };
    const output = redactValue(input) as Record<string, unknown>;
    expect(output.username).toBe('kasun');
    expect(output.password).toBe(REDACTED);
    expect((output.nested as Record<string, unknown>).token).toBe(REDACTED);
    expect((output.nested as Record<string, unknown>).amount).toBe(10);
    expect(input.password).toBe('secret');
  });

  it('handles errors, dates, buffers and circular references', () => {
    const error = new Error('Bearer abc');
    expect(redactValue(error)).toMatchObject({ name: 'Error', message: REDACTED });
    expect(redactValue(new Date('2026-11-15T00:00:00.000Z'))).toBe('2026-11-15T00:00:00.000Z');
    expect(redactValue(Buffer.from('abc'))).toBe('[Buffer 3 bytes]');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(redactValue(circular)).toEqual({ self: '[Circular]' });
  });

  it('redacts object keys case-insensitively', () => {
    expect(redactObject({ Authorization: 'x', keep: 1 })).toEqual({
      Authorization: REDACTED,
      keep: 1,
    });
  });
});

describe('logger', () => {
  it('writes structured JSON and redacts metadata', () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'test-service',
      env: 'test',
      version: '1.2.3',
      level: 'debug',
      clock: () => new Date('2026-11-15T12:00:00.000Z'),
      sink: (line) => lines.push(line),
    });

    logger.info('hello', { password: 'secret', nested: { token: 'abc' }, count: 2 });

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(record).toMatchObject({
      level: 'info',
      service: 'test-service',
      env: 'test',
      version: '1.2.3',
      message: 'hello',
      timestamp: '2026-11-15T12:00:00.000Z',
      password: REDACTED,
      count: 2,
    });
    expect((record.nested as Record<string, unknown>).token).toBe(REDACTED);
  });

  it('filters by level and merges child bindings', () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'svc',
      env: 'test',
      level: 'warn',
      sink: (line) => lines.push(line),
    });

    const child = logger.child({ requestId: 'req-1' });
    child.debug('ignored');
    child.warn('kept');

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ level: 'warn', requestId: 'req-1' });
  });
});

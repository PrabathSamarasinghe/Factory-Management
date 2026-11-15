import { describe, expect, it } from 'vitest';
import {
  AuditService,
  InMemoryAuditSink,
  REDACTED,
  verifyAuditChain,
  type AuditEntryInput,
} from '../src';

function input(index: number): AuditEntryInput {
  return {
    actorId: 'user-1',
    actorType: 'USER',
    action: 'collection.finalize',
    entityType: 'collection',
    entityId: `collection-${index}`,
    after: { index },
  };
}

describe('audit chain', () => {
  it('appends hash-linked entries', async () => {
    const sink = new InMemoryAuditSink();
    const service = new AuditService(sink);

    const first = await service.record(input(1));
    const second = await service.record(input(2));

    expect(first.previousHash).toBeNull();
    expect(second.previousHash).toBe(first.hash);
    expect(second.hash).not.toBe(first.hash);
    expect(verifyAuditChain(await sink.list())).toEqual({ valid: true });
  });

  it('keeps the chain valid under concurrent writes', async () => {
    const sink = new InMemoryAuditSink();
    const service = new AuditService(sink);

    await Promise.all(Array.from({ length: 20 }, (_, index) => service.record(input(index))));

    const entries = await sink.list();
    expect(entries).toHaveLength(20);
    expect(verifyAuditChain(entries)).toEqual({ valid: true });
  });

  it('detects tampered content', async () => {
    const sink = new InMemoryAuditSink();
    const service = new AuditService(sink);
    await service.record(input(1));
    await service.record(input(2));

    const entries = await sink.list();
    entries[1].after = { index: 99 };

    expect(verifyAuditChain(entries)).toMatchObject({
      valid: false,
      brokenAt: entries[1].id,
      reason: 'hash-mismatch',
    });
  });

  it('detects a broken previous-hash link', async () => {
    const sink = new InMemoryAuditSink();
    const service = new AuditService(sink);
    await service.record(input(1));
    await service.record(input(2));

    const entries = await sink.list();
    entries[1].previousHash = 'tampered';

    expect(verifyAuditChain(entries)).toMatchObject({
      valid: false,
      reason: 'previousHash-mismatch',
    });
  });

  it('redacts sensitive before/after/metadata', async () => {
    const sink = new InMemoryAuditSink();
    const service = new AuditService(sink);
    const entry = await service.record({
      ...input(1),
      before: { password: 'secret', totalNetKg: '100.500' },
      after: { nic: '199012345678', status: 'FINALIZED' },
      metadata: { authorization: 'Bearer xyz', ip: '10.0.0.1' },
    });

    expect(entry.before).toEqual({ password: REDACTED, totalNetKg: '100.500' });
    expect(entry.after).toEqual({ nic: REDACTED, status: 'FINALIZED' });
    expect(entry.metadata).toEqual({ authorization: REDACTED, ip: '10.0.0.1' });
    expect(verifyAuditChain(await sink.list())).toEqual({ valid: true });
  });

  it('uses the injected clock', async () => {
    const service = new AuditService(new InMemoryAuditSink(), {
      clock: () => new Date('2026-11-15T08:30:00.000Z'),
    });
    const entry = await service.record(input(1));
    expect(entry.occurredAt).toBe('2026-11-15T08:30:00.000Z');
  });
});

import { sha256Hex, constantTimeEquals } from '../crypto';
import { canonicalStringify } from '../json';
import { redactValue } from '../redaction';
import { uuidv7 } from '../ids';
import type { ActorType } from '../types';

export interface AuditEntryInput {
  actorId: string;
  actorType: ActorType;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface AuditEntry {
  id: string;
  occurredAt: string;
  actorId: string;
  actorType: ActorType;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  previousHash: string | null;
  hash: string;
}

export interface AuditSink {
  append(entry: AuditEntry): Promise<void>;
  last(): Promise<AuditEntry | null>;
  list(): Promise<AuditEntry[]>;
}

export interface AuditServiceOptions {
  clock?: () => Date;
}

export class AuditService {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly sink: AuditSink,
    private readonly options: AuditServiceOptions = {},
  ) {}

  /**
   * Append an entry to the tamper-evident chain. Calls are serialised so
   * concurrent writes cannot fork the chain.
   */
  async record(input: AuditEntryInput): Promise<AuditEntry> {
    const run = this.tail.then(() => this.write(input));
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async write(input: AuditEntryInput): Promise<AuditEntry> {
    const previous = await this.sink.last();
    const previousHash = previous?.hash ?? null;
    const occurredAt = (input.occurredAt ?? this.options.clock?.() ?? new Date()).toISOString();

    const entry: AuditEntry = {
      id: uuidv7(),
      occurredAt,
      actorId: input.actorId,
      actorType: input.actorType,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: redactValue(input.before ?? null),
      after: redactValue(input.after ?? null),
      requestId: input.requestId,
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: redactValue(input.metadata ?? null) as Record<string, unknown>,
      previousHash,
      hash: '',
    };

    entry.hash = computeAuditHash(entry, previousHash);
    await this.sink.append(entry);
    return entry;
  }
}

export class InMemoryAuditSink implements AuditSink {
  private readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  async last(): Promise<AuditEntry | null> {
    return this.entries.length ? this.entries[this.entries.length - 1] : null;
  }

  async list(): Promise<AuditEntry[]> {
    return [...this.entries];
  }
}

/**
 * Hash of the auditable fields plus the previous entry hash.
 * `HMAC-SHA256` with a managed audit secret is a later hardening step;
 * the plain chain already detects partial rewrites.
 */
export function computeAuditHash(entry: AuditEntry, previousHash: string | null): string {
  return sha256Hex(
    canonicalStringify({
      id: entry.id,
      occurredAt: entry.occurredAt,
      actorId: entry.actorId,
      actorType: entry.actorType,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
      requestId: entry.requestId ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: entry.metadata ?? null,
      previousHash,
    }),
  );
}

export interface VerifyAuditChainResult {
  valid: boolean;
  brokenAt?: string;
  reason?: 'previousHash-mismatch' | 'hash-mismatch';
}

export function verifyAuditChain(entries: AuditEntry[]): VerifyAuditChainResult {
  let previousHash: string | null = null;
  for (const entry of entries) {
    if (entry.previousHash !== previousHash) {
      return { valid: false, brokenAt: entry.id, reason: 'previousHash-mismatch' };
    }
    const expected = computeAuditHash(entry, previousHash);
    if (!constantTimeEquals(expected, entry.hash)) {
      return { valid: false, brokenAt: entry.id, reason: 'hash-mismatch' };
    }
    previousHash = entry.hash;
  }
  return { valid: true };
}

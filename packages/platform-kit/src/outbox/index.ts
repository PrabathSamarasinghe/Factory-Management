import { uuidv7 } from '../ids';
import type { ActorType } from '../types';

export interface Actor {
  type: ActorType;
  /** Principal id when known; null for SYSTEM actors. */
  id?: string | null;
}

export interface EventEnvelope<TPayload = unknown> {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  producer?: string;
  actor: Actor;
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  payload: TPayload;
}

export interface CreateEventInput<TPayload> {
  type: string;
  version?: number;
  payload: TPayload;
  actor: Actor;
  producer?: string;
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  occurredAt?: Date;
}

export function createEvent<TPayload>(input: CreateEventInput<TPayload>): EventEnvelope<TPayload> {
  return {
    id: uuidv7(),
    type: input.type,
    version: input.version ?? 1,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    ...(input.producer ? { producer: input.producer } : {}),
    actor: input.actor,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.causationId ? { causationId: input.causationId } : {}),
    ...(input.traceId ? { traceId: input.traceId } : {}),
    payload: input.payload,
  };
}

export interface OutboxRecord {
  id: string;
  event: EventEnvelope;
  createdAt: string;
  publishedAt: string | null;
  attempts: number;
  lastError: string | null;
}

export interface OutboxStore {
  append(event: EventEnvelope): Promise<OutboxRecord>;
  pending(limit: number): Promise<OutboxRecord[]>;
  markPublished(id: string, publishedAt: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

export interface EventBus {
  publish(event: EventEnvelope): Promise<void>;
}

export interface OutboxPublisherOptions {
  batchSize?: number;
  maxAttempts?: number;
  publishTimeoutMs?: number;
  clock?: () => Date;
}

export class OutboxPublisher {
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly publishTimeoutMs: number;
  private readonly clock: () => Date;

  constructor(
    private readonly store: OutboxStore,
    private readonly bus: EventBus,
    options: OutboxPublisherOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 100;
    this.maxAttempts = options.maxAttempts ?? 10;
    this.publishTimeoutMs = options.publishTimeoutMs ?? 10_000;
    this.clock = options.clock ?? (() => new Date());
  }

  async publishPending(): Promise<{ published: number; failed: number }> {
    const records = await this.store.pending(this.batchSize);
    let published = 0;
    let failed = 0;

    for (const record of records) {
      if (record.attempts >= this.maxAttempts) {
        continue;
      }
      try {
        await withTimeout(this.bus.publish(record.event), this.publishTimeoutMs);
        await this.store.markPublished(record.id, this.clock().toISOString());
        published += 1;
      } catch (error) {
        await this.store.markFailed(record.id, errorMessage(error));
        failed += 1;
      }
    }

    return { published, failed };
  }
}

export class InMemoryOutboxStore implements OutboxStore {
  private readonly records: OutboxRecord[] = [];

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async append(event: EventEnvelope): Promise<OutboxRecord> {
    const record: OutboxRecord = {
      id: uuidv7(),
      event,
      createdAt: this.clock().toISOString(),
      publishedAt: null,
      attempts: 0,
      lastError: null,
    };
    this.records.push(record);
    return record;
  }

  async pending(limit: number): Promise<OutboxRecord[]> {
    return this.records
      .filter((record) => record.publishedAt === null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map((record) => ({ ...record }));
  }

  async markPublished(id: string, publishedAt: string): Promise<void> {
    const record = this.records.find((candidate) => candidate.id === id);
    if (record) {
      record.publishedAt = publishedAt;
      record.lastError = null;
    }
  }

  async markFailed(id: string, error: string): Promise<void> {
    const record = this.records.find((candidate) => candidate.id === id);
    if (record) {
      record.attempts += 1;
      record.lastError = error;
    }
  }

  async all(): Promise<OutboxRecord[]> {
    return this.records.map((record) => ({ ...record }));
  }
}

type EventHandler = (event: EventEnvelope) => void | Promise<void>;

export class InMemoryEventBus implements EventBus {
  readonly events: EventEnvelope[] = [];
  private readonly handlers = new Map<string, Set<EventHandler>>();

  async publish(event: EventEnvelope): Promise<void> {
    this.events.push(event);
    for (const handler of this.handlers.get(event.type) ?? []) {
      await handler(event);
    }
  }

  subscribe(type: string, handler: EventHandler): () => void {
    const handlers = this.handlers.get(type) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.handlers.set(type, handlers);
    return () => {
      handlers.delete(handler);
    };
  }
}

export interface InboxStore {
  hasProcessed(eventId: string, consumer: string): Promise<boolean>;
  markProcessed(eventId: string, consumer: string, processedAt: string): Promise<boolean>;
}

export class InMemoryInboxStore implements InboxStore {
  private readonly processed = new Set<string>();

  async hasProcessed(eventId: string, consumer: string): Promise<boolean> {
    return this.processed.has(`${consumer}:${eventId}`);
  }

  async markProcessed(eventId: string, consumer: string, _processedAt: string): Promise<boolean> {
    const key = `${consumer}:${eventId}`;
    if (this.processed.has(key)) {
      return false;
    }
    this.processed.add(key);
    return true;
  }
}

export class InboxProcessor {
  private readonly inFlight = new Map<string, Promise<'processed' | 'duplicate'>>();

  constructor(
    private readonly store: InboxStore,
    private readonly consumer: string,
    private readonly handler: (event: EventEnvelope) => Promise<void>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  process(event: EventEnvelope): Promise<'processed' | 'duplicate'> {
    const key = `${this.consumer}:${event.id}`;
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing.then(() => 'duplicate' as const);
    }
    const run = this.run(event).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  private async run(event: EventEnvelope): Promise<'processed' | 'duplicate'> {
    if (await this.store.hasProcessed(event.id, this.consumer)) {
      return 'duplicate';
    }
    await this.handler(event);
    const inserted = await this.store.markProcessed(
      event.id,
      this.consumer,
      this.clock().toISOString(),
    );
    return inserted ? 'processed' : 'duplicate';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

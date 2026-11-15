import { describe, expect, it } from 'vitest';
import {
  InMemoryEventBus,
  InMemoryInboxStore,
  InMemoryOutboxStore,
  InboxProcessor,
  OutboxPublisher,
  createEvent,
  uuidv7,
  type EventBus,
  type EventEnvelope,
} from '../src';

const actor = { type: 'USER' as const, id: uuidv7() };

function event(index = 1): EventEnvelope {
  return createEvent({
    type: 'collection.finalized',
    payload: { index },
    actor,
    producer: 'collection-service',
  });
}

class FlakyBus implements EventBus {
  attempts = 0;
  published: EventEnvelope[] = [];

  constructor(private failuresRemaining: number) {}

  async publish(envelope: EventEnvelope): Promise<void> {
    this.attempts += 1;
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('broker down');
    }
    this.published.push(envelope);
  }
}

describe('events', () => {
  it('creates a contract-shaped envelope with a unique id', () => {
    const envelope = event();
    expect(envelope).toMatchObject({
      type: 'collection.finalized',
      version: 1,
      actor,
      producer: 'collection-service',
      payload: { index: 1 },
    });
    expect(envelope.id).not.toBe(event().id);
    expect(new Date(envelope.occurredAt).toISOString()).toBe(envelope.occurredAt);
  });

  it('allows SYSTEM actors without an id', () => {
    const envelope = createEvent({
      type: 'attendance.day.closed',
      payload: {},
      actor: { type: 'SYSTEM' },
    });
    expect(envelope.actor).toEqual({ type: 'SYSTEM' });
  });
});

describe('outbox', () => {
  it('publishes pending events and marks them', async () => {
    const store = new InMemoryOutboxStore();
    const bus = new InMemoryEventBus();
    const publisher = new OutboxPublisher(store, bus);

    const envelope = event();
    const record = await store.append(envelope);

    await expect(publisher.publishPending()).resolves.toEqual({ published: 1, failed: 0 });

    expect(bus.events).toEqual([envelope]);
    const [stored] = await store.pending(10);
    expect(stored).toBeUndefined();
    expect((await store.all())[0]).toMatchObject({ id: record.id, attempts: 0 });
  });

  it('retries failed publishes and records the error', async () => {
    const store = new InMemoryOutboxStore();
    const bus = new FlakyBus(1);
    const publisher = new OutboxPublisher(store, bus);
    await store.append(event());

    await expect(publisher.publishPending()).resolves.toEqual({ published: 0, failed: 1 });
    let [record] = await store.pending(10);
    expect(record.attempts).toBe(1);
    expect(record.lastError).toBe('broker down');

    await expect(publisher.publishPending()).resolves.toEqual({ published: 1, failed: 0 });
    [record] = await store.pending(10);
    expect(record).toBeUndefined();
    expect(bus.published).toHaveLength(1);
  });

  it('stops retrying after maxAttempts', async () => {
    const store = new InMemoryOutboxStore();
    const bus = new FlakyBus(Number.POSITIVE_INFINITY);
    const publisher = new OutboxPublisher(store, bus, { maxAttempts: 1 });
    await store.append(event());

    await expect(publisher.publishPending()).resolves.toEqual({ published: 0, failed: 1 });
    await expect(publisher.publishPending()).resolves.toEqual({ published: 0, failed: 0 });
    expect((await store.pending(10))[0].attempts).toBe(1);
  });

  it('fans out subscribed events through the in-memory bus', async () => {
    const bus = new InMemoryEventBus();
    const received: string[] = [];
    const unsubscribe = bus.subscribe('collection.finalized', async (envelope) => {
      received.push(envelope.id);
    });

    const envelope = event();
    await bus.publish(envelope);
    unsubscribe();
    await bus.publish(event());

    expect(received).toEqual([envelope.id]);
  });
});

describe('inbox', () => {
  it('processes an event once and reports duplicates', async () => {
    const store = new InMemoryInboxStore();
    let handled = 0;
    const processor = new InboxProcessor(store, 'accounts-service', async () => {
      handled += 1;
    });

    const envelope = event();
    await expect(processor.process(envelope)).resolves.toBe('processed');
    await expect(processor.process(envelope)).resolves.toBe('duplicate');
    expect(handled).toBe(1);
  });

  it('de-duplicates concurrent deliveries of the same event', async () => {
    const store = new InMemoryInboxStore();
    let handled = 0;
    const processor = new InboxProcessor(store, 'reporting-service', async () => {
      handled += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const envelope = event();
    const results = await Promise.all([processor.process(envelope), processor.process(envelope)]);

    expect(results).toEqual(['processed', 'duplicate']);
    expect(handled).toBe(1);
  });
});

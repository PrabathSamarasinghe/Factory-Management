import { describe, expect, it } from 'vitest';
import { createEvent } from '@galatura/platform-kit';
import { OutboxService } from '../src/outbox/outbox.service';
import { ConsentWithdrawalDispatcher } from '../src/events/consent-withdrawal-dispatcher';

function buildPrisma() {
  const rows: any[] = [];
  const prisma: any = {
    outboxEvent: {
      create: async (args: any) => {
        const row = {
          ...args.data,
          createdAt: new Date(),
          publishedAt: null,
          attempts: 0,
          lastError: null,
        };
        rows.push(row);
        return row;
      },
      findMany: async () => rows.filter((row) => row.publishedAt === null),
      findUnique: async (args: any) => rows.find((row) => row.id === args.where.id) ?? null,
      update: async (args: any) => {
        const row = rows.find((candidate) => candidate.id === args.where.id);
        Object.assign(row, args.data);
        return row;
      },
    },
    __rows: rows,
  };
  return prisma;
}

describe('consent withdrawal dispatcher', () => {
  it('marks events published after the bus accepts them', async () => {
    const prisma = buildPrisma();
    const outbox = new OutboxService(prisma);
    const event = createEvent({
      type: 'people.consent.withdrawn',
      actor: { type: 'SYSTEM' },
      payload: { personId: 'person-1' },
    });
    await outbox.append(event);

    const published: string[] = [];
    const dispatcher = new ConsentWithdrawalDispatcher(outbox, {
      publish: async (candidate) => {
        published.push(candidate.id);
      },
    });
    const result = await dispatcher.publishPending();

    expect(result).toEqual({ published: 1, failed: 0 });
    expect(published).toEqual([event.id]);
    expect(prisma.__rows[0].publishedAt).toBeInstanceOf(Date);
  });

  it('retains failed events in the outbox with an attempt count', async () => {
    const prisma = buildPrisma();
    const outbox = new OutboxService(prisma);
    await outbox.append(
      createEvent({
        type: 'people.consent.withdrawn',
        actor: { type: 'SYSTEM' },
        payload: { personId: 'person-1' },
      }),
    );

    const dispatcher = new ConsentWithdrawalDispatcher(outbox, {
      publish: async () => {
        throw new Error('attendance unavailable');
      },
    });
    const result = await dispatcher.publishPending();

    expect(result).toEqual({ published: 0, failed: 1 });
    expect(prisma.__rows[0]).toMatchObject({ attempts: 1, lastError: 'attendance unavailable' });
    expect(prisma.__rows[0].publishedAt).toBeNull();
  });
});

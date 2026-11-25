import { Injectable } from '@nestjs/common';
import type { EventEnvelope, OutboxRecord, OutboxStore } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboxService implements OutboxStore {
  constructor(private readonly prisma: PrismaService) {}

  async append(event: EventEnvelope, tx?: any): Promise<OutboxRecord> {
    const client = tx ?? this.prisma;
    const row = await client.outboxEvent.create({
      data: {
        id: event.id,
        envelope: event as unknown as object,
      },
    });
    return this.toRecord(row);
  }

  async pending(limit: number): Promise<OutboxRecord[]> {
    const rows = await this.prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map((row: any) => this.toRecord(row));
  }

  async markPublished(id: string, publishedAt: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { publishedAt: new Date(publishedAt), lastError: null },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    const row = await this.prisma.outboxEvent.findUnique({ where: { id } });
    if (!row) {
      return;
    }
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { attempts: (row.attempts ?? 0) + 1, lastError: error },
    });
  }

  private toRecord(row: any): OutboxRecord {
    return {
      id: row.id,
      event: row.envelope as EventEnvelope,
      createdAt: toIso(row.createdAt),
      publishedAt: row.publishedAt ? toIso(row.publishedAt) : null,
      attempts: row.attempts ?? 0,
      lastError: row.lastError ?? null,
    };
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

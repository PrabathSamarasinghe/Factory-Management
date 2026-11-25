import { Injectable } from '@nestjs/common';
import {
  BusinessRuleError,
  ForbiddenError,
  ValidationError,
  uuidv7,
  type EventEnvelope,
} from '@galatura/platform-kit';
import { AuditService } from '../audit/audit.service';
import { dateTime, isUuidText, requiredString, uuid } from '../common/validation';
import { FcmService } from '../push/fcm.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from '../webhooks/webhooks.service';
import { RealtimeGateway } from '../ws/realtime.gateway';
import {
  canSubscribe,
  channelsForEvent,
  isPermissionChange,
  permissionsForChannel,
} from './channel-map';
import { sanitizePayload } from './sanitize';

export const EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
const CONSUMER = 'realtime-service';

export function serializeEvent(row: any): Record<string, unknown> {
  const asIso = (value: unknown): string => {
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  };
  return {
    id: row.id,
    channel: row.channel,
    eventType: row.eventType,
    payload: row.payload,
    requiredPermission: row.requiredPermission,
    createdAt: asIso(row.createdAt),
    expiresAt: asIso(row.expiresAt),
  };
}

export function principalIdsFromEvent(event: EventEnvelope<any>): string[] {
  const result = new Set<string>();
  const actorId = event?.actor?.id;
  if (typeof actorId === 'string' && actorId.trim()) result.add(actorId.trim());
  const payload = (event?.payload ?? {}) as Record<string, unknown>;
  for (const key of ['principalId', 'userId']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) result.add(value.trim());
  }
  for (const key of ['principalIds', 'userIds']) {
    const value = payload[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) result.add(item.trim());
      }
    }
  }
  return [...result];
}

@Injectable()
export class EventsService {
  clock: () => Date = () => new Date();
  idFactory: () => string = () => uuidv7();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RealtimeGateway,
    private readonly webhooks: WebhookService,
    private readonly push: FcmService,
    private readonly audit: AuditService,
  ) {}

  async ingest(event: EventEnvelope<any>): Promise<Record<string, unknown>> {
    const eventId = uuid(event?.id, 'event.id');
    const type = requiredString(event?.type, 'event.type');
    if (event?.version !== 1) throw new BusinessRuleError('Only event version 1 is supported.');

    const existing = await this.prisma.processedEvent.findUnique({
      where: { consumer_id: { consumer: CONSUMER, id: eventId } },
    });
    if (existing) return { status: 'duplicate', eventId, type, channels: [], published: 0 };

    const createdAt = event?.occurredAt
      ? dateTime(event.occurredAt, 'event.occurredAt')
      : this.clock();
    const expiresAt = new Date(createdAt.getTime() + EVENT_RETENTION_MS);
    const payload = sanitizePayload(event.payload);
    const rawPayload = (event?.payload ?? {}) as Record<string, unknown>;
    const mappings = channelsForEvent(type);
    const channelNames = mappings.map((item) => item.channel);
    const principalIds = principalIdsFromEvent(event);
    const serialized: Record<string, unknown>[] = [];

    for (const mapping of mappings) {
      const row = await this.prisma.realtimeEvent.create({
        data: {
          id: this.idFactory(),
          channel: mapping.channel,
          eventType: type,
          payload: payload as any,
          requiredPermission: mapping.requiredPermission,
          createdAt,
          expiresAt,
        },
      });
      const output = serializeEvent(row);
      serialized.push(output);
      this.gateway.publish(mapping.channel, output);
    }

    if (isPermissionChange(type)) {
      const principalId = principalIds[0] ?? String(rawPayload.principalId ?? '');
      const permissions = Array.isArray(rawPayload.permissions)
        ? rawPayload.permissions.filter((item): item is string => typeof item === 'string')
        : [];
      if (principalId) this.gateway.applyPermissionChange(principalId, permissions);
    }

    if (channelNames.includes('monitor.today')) {
      await this.push.notifyMonitorRefresh(principalIds);
    }

    await this.webhooks.dispatch({
      eventId,
      eventType: type,
      channels: channelNames,
      payload,
    });

    await this.prisma.processedEvent.create({
      data: {
        id: eventId,
        consumer: CONSUMER,
        type,
        processedAt: this.clock(),
      },
    });

    this.audit.record({
      action: 'event.ingested',
      entityType: 'RealtimeEvent',
      entityId: eventId,
      details: { type, channels: channelNames, eventCount: serialized.length },
      now: this.clock(),
    });

    return {
      status: 'processed',
      eventId,
      type,
      channels: channelNames,
      events: serialized,
    };
  }

  async catchUp(input: {
    channel: string;
    afterId?: string;
    permissions: readonly string[];
  }): Promise<Record<string, unknown>[]> {
    const channel = requiredString(input.channel, 'channel');
    if (!canSubscribe(input.permissions, channel)) {
      throw new ForbiddenError(`Not authorized for channel "${channel}".`);
    }

    const now = this.clock();
    let after = new Date(0);
    if (input.afterId) {
      const cursor = isUuidText(input.afterId)
        ? await this.prisma.realtimeEvent.findUnique({ where: { id: input.afterId } })
        : null;
      if (cursor) {
        const value =
          cursor.createdAt instanceof Date ? cursor.createdAt : new Date(String(cursor.createdAt));
        after = Number.isNaN(value.getTime()) ? new Date(0) : value;
      } else {
        const parsed = new Date(input.afterId);
        after = Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
      }
    }

    const rows = await this.prisma.realtimeEvent.findMany({
      where: {
        channel,
        createdAt: { gt: after },
        expiresAt: { gt: now },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows
      .filter((row) => {
        const expires =
          row.expiresAt instanceof Date ? row.expiresAt : new Date(String(row.expiresAt));
        return expires.getTime() > now.getTime();
      })
      .map(serializeEvent);
  }

  requiredPermissionsFor(channel: string): string[] {
    const permissions = permissionsForChannel(channel);
    if (permissions.length === 0) throw new ValidationError(`Unknown channel "${channel}".`);
    return permissions;
  }
}

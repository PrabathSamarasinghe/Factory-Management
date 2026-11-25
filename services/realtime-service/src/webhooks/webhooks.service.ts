import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  createEvent,
  sha256Hex,
  uuidv7,
} from '@galatura/platform-kit';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { readHeader, readRawBody } from '../common/request';
import { requiredString, stringArray, uuid } from '../common/validation';
import { isKnownEventType, isChannel } from '../events/channel-map';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  maskSecretHint,
  signatureIsValid,
  signWebhookBody,
} from './crypto';
import { validateTargetUrl } from './url';

export interface UpdateSubscriptionInput {
  name?: string;
  targetUrl?: string;
  eventTypes?: string[];
  secret?: string;
  active?: boolean;
}

export interface DeliveryResult {
  id: string;
  subscriptionId: string;
  eventId: string;
  attempt: number;
  status: string;
  responseCode: number | null;
  error: string | null;
}

interface DispatchInput {
  eventId: string;
  eventType: string;
  channels: string[];
  payload: Record<string, unknown>;
}

interface SubscriptionRow {
  id: string;
  name: string;
  targetUrl: string;
  eventTypes: unknown;
  secretEnc: Buffer | Uint8Array | string;
  active: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class WebhookService {
  clock: () => Date = () => new Date();
  idFactory: () => string = () => uuidv7();
  timeoutMs = Number(process.env.WEBHOOK_TIMEOUT_MS ?? 5_000);
  fetchImpl: (...args: Parameters<typeof fetch>) => Promise<Response> = (...args) => fetch(...args);
  delay: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get maxAttempts(): number {
    return 3;
  }

  async list(): Promise<unknown[]> {
    const rows = await this.prisma.webhookSubscription.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.serialize(row as SubscriptionRow)));
  }

  async get(id: string): Promise<unknown> {
    return this.serialize(await this.find(id));
  }

  async create(input: UpdateSubscriptionInput, actorId?: string): Promise<unknown> {
    const name = requiredString(input.name, 'name');
    const targetUrl = validateTargetUrl(input.targetUrl);
    const eventTypes = this.validateEventTypes(input.eventTypes);
    const secret = requiredString(input.secret, 'secret');
    const now = this.clock();
    const row = await this.prisma.webhookSubscription.create({
      data: {
        id: this.idFactory(),
        name,
        targetUrl,
        eventTypes,
        secretEnc: (await encryptWebhookSecret(secret)) as any,
        active: input.active ?? true,
        createdBy: actorId ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });

    this.audit.record({
      action: 'webhook_subscription.created',
      entityType: 'WebhookSubscription',
      entityId: row.id,
      details: { name, targetUrl, eventTypes },
      now,
    });
    return this.serialize(row as SubscriptionRow);
  }

  async update(id: string, input: UpdateSubscriptionInput): Promise<unknown> {
    const existing = await this.find(id);
    const data: Record<string, unknown> = { updatedAt: this.clock() };
    if (input.name !== undefined) data.name = requiredString(input.name, 'name');
    if (input.targetUrl !== undefined) data.targetUrl = validateTargetUrl(input.targetUrl);
    if (input.eventTypes !== undefined) data.eventTypes = this.validateEventTypes(input.eventTypes);
    if (input.secret !== undefined) {
      data.secretEnc = await encryptWebhookSecret(requiredString(input.secret, 'secret'));
    }
    if (input.active !== undefined) {
      if (typeof input.active !== 'boolean') throw new ValidationError('active must be a boolean.');
      data.active = input.active;
    }

    const row = await this.prisma.webhookSubscription.update({
      where: { id: existing.id },
      data,
    });
    this.audit.record({
      action: 'webhook_subscription.updated',
      entityType: 'WebhookSubscription',
      entityId: existing.id,
      details: { fields: Object.keys(data).filter((field) => field !== 'updatedAt') },
      now: this.clock(),
    });
    return this.serialize(row as SubscriptionRow);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const existing = await this.find(id);
    await this.prisma.webhookSubscription.delete({ where: { id: existing.id } });
    this.audit.record({
      action: 'webhook_subscription.deleted',
      entityType: 'WebhookSubscription',
      entityId: existing.id,
      now: this.clock(),
    });
    return { id: existing.id, deleted: true };
  }

  async sendTest(id: string): Promise<DeliveryResult[]> {
    const subscription = await this.find(id);
    const event = createEvent({
      type: 'webhook.test',
      version: 1,
      producer: 'realtime-service',
      actor: { type: 'SYSTEM' },
      payload: { status: 'ok' },
      occurredAt: this.clock(),
    });
    const secret = await decryptWebhookSecret(subscription.secretEnc);
    return this.deliver(subscription, secret, {
      eventId: event.id,
      eventType: event.type,
      channels: [],
      payload: event.payload as Record<string, unknown>,
    });
  }

  async dispatch(input: DispatchInput): Promise<DeliveryResult[]> {
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: { active: true },
    });
    const results: DeliveryResult[] = [];
    for (const row of subscriptions) {
      const subscription = row as SubscriptionRow;
      const eventTypes = this.parseEventTypes(subscription.eventTypes);
      if (!this.matches(eventTypes, input.eventType, input.channels)) continue;
      const secret = await decryptWebhookSecret(subscription.secretEnc);
      results.push(...(await this.deliver(subscription, secret, input)));
    }
    return results;
  }

  async handleInbound(
    provider: string,
    req: Request,
    body: unknown,
  ): Promise<{ status: 'accepted' }> {
    const providerName = requiredString(provider, 'provider')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    const rawBody = readRawBody(req);
    const timestamp = readHeader(req, 'x-galatura-timestamp');
    if (!timestamp) throw new UnauthorizedError('Missing webhook timestamp.');
    const signature =
      readHeader(req, 'x-galatura-signature') ?? readHeader(req, `x-${providerName}-signature`);
    const secret = await this.inboundSecret(providerName);
    if (!signatureIsValid(signature ?? undefined, secret, timestamp, rawBody)) {
      throw new UnauthorizedError('Invalid webhook signature.');
    }

    const eventId = this.deterministicId(`${providerName}:${timestamp}:${rawBody}`);
    const existing = await this.prisma.processedEvent.findUnique({
      where: { consumer_id: { consumer: 'realtime-service', id: eventId } },
    });
    if (existing) return { status: 'accepted' };

    await this.prisma.processedEvent.create({
      data: {
        id: eventId,
        consumer: 'realtime-service',
        type: `inbound.${providerName}`,
        processedAt: this.clock(),
      },
    });
    this.audit.record({
      action: 'webhook.inbound_accepted',
      entityType: 'WebhookInbound',
      entityId: eventId,
      details: { provider: providerName, bodyType: typeof body },
      now: this.clock(),
    });
    return { status: 'accepted' };
  }

  private async serialize(row: SubscriptionRow): Promise<unknown> {
    let hint = '****';
    try {
      hint = maskSecretHint(await decryptWebhookSecret(row.secretEnc));
    } catch {
      hint = '****';
    }
    return {
      id: row.id,
      name: row.name,
      targetUrl: row.targetUrl,
      eventTypes: this.parseEventTypes(row.eventTypes),
      secretHint: hint,
      active: Boolean(row.active),
      createdBy: row.createdBy ?? null,
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt),
    };
  }

  private async find(id: string): Promise<SubscriptionRow> {
    const row = await this.prisma.webhookSubscription.findUnique({ where: { id: uuid(id, 'id') } });
    if (!row) throw new NotFoundError('Webhook subscription not found.');
    return row as SubscriptionRow;
  }

  private validateEventTypes(value: unknown): string[] {
    const eventTypes = stringArray(value, 'eventTypes');
    if (eventTypes.length === 0) throw new ValidationError('eventTypes must not be empty.');
    for (const type of eventTypes) {
      if (type !== '*' && !isKnownEventType(type) && !isChannel(type)) {
        throw new ValidationError(`Unknown event type "${type}".`);
      }
    }
    return eventTypes;
  }

  private parseEventTypes(value: unknown): string[] {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private matches(eventTypes: string[], eventType: string, channels: string[]): boolean {
    return eventTypes.some((type) => type === '*' || type === eventType || channels.includes(type));
  }

  private async inboundSecret(provider: string): Promise<string> {
    const envKey = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_WEBHOOK_SECRET`;
    const fromEnv = process.env[envKey] || process.env.WEBHOOK_INBOUND_SECRET;
    if (fromEnv) return fromEnv;

    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: { active: true },
    });
    for (const row of subscriptions) {
      const subscription = row as SubscriptionRow;
      if (
        subscription.name.toLowerCase() === provider ||
        subscription.name.toLowerCase() === `inbound:${provider}`
      ) {
        return decryptWebhookSecret(subscription.secretEnc);
      }
    }
    throw new UnauthorizedError('No webhook secret configured for provider.');
  }

  private async deliver(
    subscription: SubscriptionRow,
    secret: string,
    input: DispatchInput,
  ): Promise<DeliveryResult[]> {
    const timestamp = String(Math.floor(this.clock().getTime() / 1000));
    const body = JSON.stringify({
      id: input.eventId,
      type: input.eventType,
      occurredAt: this.clock().toISOString(),
      data: input.payload,
    });
    const signature = signWebhookBody(secret, timestamp, body);
    const results: DeliveryResult[] = [];

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const now = this.clock();
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          id: this.idFactory(),
          subscriptionId: subscription.id,
          eventId: input.eventId,
          attempt,
          status: 'PENDING',
          createdAt: now,
        },
      });
      let responseCode: number | null = null;
      let errorMessage: string | null = null;
      try {
        const response = await withTimeout(
          this.fetchImpl(subscription.targetUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-galatura-signature': signature,
              'x-galatura-timestamp': timestamp,
            },
            body,
          }),
          this.timeoutMs,
        );
        responseCode = response.status;
        if (!response.ok) throw new Error(`Webhook responded with HTTP ${response.status}.`);
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'DELIVERED', responseCode, error: null, deliveredAt: this.clock() },
        });
        results.push({
          id: delivery.id,
          subscriptionId: subscription.id,
          eventId: input.eventId,
          attempt,
          status: 'DELIVERED',
          responseCode,
          error: null,
        });
        break;
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'FAILED', responseCode, error: errorMessage.slice(0, 500) },
        });
        results.push({
          id: delivery.id,
          subscriptionId: subscription.id,
          eventId: input.eventId,
          attempt,
          status: 'FAILED',
          responseCode,
          error: errorMessage.slice(0, 500),
        });
        if (attempt < this.maxAttempts) await this.delay(100 * 2 ** (attempt - 1));
      }
    }
    return results;
  }

  private deterministicId(text: string): string {
    const hex = sha256Hex(text).slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  private toIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Webhook request timed out.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

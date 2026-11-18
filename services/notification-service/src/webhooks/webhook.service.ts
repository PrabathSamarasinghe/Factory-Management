import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@galatura/platform-kit';
import type { Request } from 'express';
import { $Enums } from '../../generated/prisma';
import { AuditService } from '../audit/audit.service';
import { CollectionStatusService } from '../collection/collection-status.service';
import { assertServiceToken, readRawBody, verifyWebhookSignature } from '../common/request';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';

interface DeliveryReceipt {
  provider?: string;
  providerMessageId?: string;
  clientReference?: string;
  status?: string;
  reason?: string;
}

@Injectable()
export class WebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly collectionStatus: CollectionStatusService,
  ) {}

  async handle(req: Request, receipt: DeliveryReceipt): Promise<{ ok: true }> {
    assertServiceToken(req);
    if (!verifyWebhookSignature(readRawBody(req), req.headers['x-sms-signature'] as string)) {
      throw new UnauthorizedError('Invalid SMS webhook signature.');
    }

    const provider = (receipt.provider || process.env.SMS_PROVIDER || 'FAKE').toUpperCase();
    const allowed = (process.env.SMS_ALLOWED_PROVIDERS || 'FAKE,HTTP')
      .split(',')
      .map((value) => value.trim().toUpperCase());
    if (!allowed.includes(provider)) {
      throw new UnauthorizedError('SMS provider is not allow-listed.');
    }

    const status = String(receipt.status || '').toUpperCase();
    if (!['SENT', 'DELIVERED', 'FAILED'].includes(status)) {
      throw new ValidationError('Unsupported delivery status.');
    }
    const message = await this.prisma.smsMessage.findFirst({
      where: {
        provider,
        ...(receipt.providerMessageId
          ? { providerMessageId: receipt.providerMessageId }
          : { idempotencyKey: receipt.clientReference || '' }),
      },
    });
    if (!message) {
      throw new NotFoundError('SMS message not found for delivery receipt.');
    }
    if (message.providerMessageId && receipt.providerMessageId !== message.providerMessageId) {
      throw new ConflictError('Delivery receipt provider message id does not match.');
    }

    const now = new Date();
    const nextStatus =
      status === 'FAILED'
        ? $Enums.SmsMessageStatus.FAILED
        : status === 'DELIVERED'
          ? $Enums.SmsMessageStatus.DELIVERED
          : $Enums.SmsMessageStatus.SENT;
    await this.prisma.smsMessage.update({
      where: { id: message.id },
      data: {
        status: nextStatus,
        ...(status === 'DELIVERED' ? { deliveredAt: message.deliveredAt ?? now } : {}),
        ...(status === 'FAILED'
          ? { lastError: (receipt.reason || 'Delivery failed.').slice(0, 500) }
          : {}),
      },
    });

    if (message.status !== nextStatus) {
      await this.outbox.append(
        status === 'FAILED' ? 'sms.failed' : `sms.${status.toLowerCase()}`,
        {
          messageId: message.id,
          provider,
          providerMessageId: receipt.providerMessageId || message.providerMessageId,
          relatedType: message.relatedType,
          relatedId: message.relatedId,
          occurredAt: now.toISOString(),
        },
        { type: 'SYSTEM' },
      );
      await this.audit.record({
        action: `sms.${status.toLowerCase()}`,
        entityType: 'SmsMessage',
        entityId: message.id,
        metadata: { provider, reason: receipt.reason },
      });
    }

    if (status === 'FAILED') {
      await this.collectionStatus.update(message.relatedId, 'FAILED', message.id);
    } else if (status === 'DELIVERED') {
      await this.collectionStatus.update(message.relatedId, 'SENT', message.id);
    }
    return { ok: true };
  }
}

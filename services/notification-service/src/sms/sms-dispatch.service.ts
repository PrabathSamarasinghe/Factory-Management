import { ConflictError } from '@galatura/platform-kit';
import { Injectable, Logger } from '@nestjs/common';
import { $Enums } from '../../generated/prisma';
import { AuditService } from '../audit/audit.service';
import { CollectionStatusService } from '../collection/collection-status.service';
import { OutboxService } from '../outbox/outbox.service';
import { PhoneService } from '../phone/phone.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsProviderService } from '../provider/sms-provider.service';

const QUEUED = $Enums.SmsMessageStatus.QUEUED;
const SENT = $Enums.SmsMessageStatus.SENT;
const DELIVERED = $Enums.SmsMessageStatus.DELIVERED;
const FAILED = $Enums.SmsMessageStatus.FAILED;

@Injectable()
export class SmsDispatchService {
  private readonly logger = new Logger(SmsDispatchService.name);
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: SmsProviderService,
    private readonly phone: PhoneService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly collectionStatus: CollectionStatusService,
  ) {}

  async dispatch(messageId: string): Promise<void> {
    if (this.inFlight.has(messageId)) return;
    this.inFlight.add(messageId);

    try {
      const message = await this.prisma.smsMessage.findUnique({ where: { id: messageId } });
      if (!message || message.status !== QUEUED) return;

      const costEstimate = await this.assertBudget(message.provider);
      const to = await this.phone.decrypt(message.recipientPhoneEnc);
      const result = await this.provider.send({
        to,
        text: message.bodyRendered,
        senderId: message.senderId || process.env.SMS_SENDER_ID || 'GALATURA',
        clientReference: message.idempotencyKey,
      });

      const sentAt = new Date();
      await this.prisma.smsMessage.update({
        where: { id: message.id },
        data: {
          status: result.status === 'DELIVERED' ? DELIVERED : SENT,
          providerMessageId: result.providerMessageId,
          attempts: { increment: 1 },
          costEstimate: result.costEstimate ?? costEstimate,
          lastError: null,
          nextAttemptAt: null,
          sentAt,
          ...(result.status === 'DELIVERED' ? { deliveredAt: sentAt } : {}),
        },
      });

      await this.collectionStatus.update(message.relatedId, 'SENT', message.id);
      await this.outbox.append(
        'sms.sent',
        {
          messageId: message.id,
          provider: message.provider,
          providerMessageId: result.providerMessageId,
          relatedType: message.relatedType,
          relatedId: message.relatedId,
          sentAt: sentAt.toISOString(),
        },
        { type: 'SYSTEM' },
      );
      await this.audit.record({
        action: 'sms.sent',
        entityType: 'SmsMessage',
        entityId: message.id,
        metadata: { provider: message.provider, attempts: message.attempts + 1 },
      });
    } catch (error) {
      await this.handleFailure(messageId, error);
    } finally {
      this.inFlight.delete(messageId);
    }
  }

  private async assertBudget(provider: string): Promise<number> {
    const config = await this.prisma.smsProviderConfig.findUnique({ where: { provider } });
    const dailyLimit = config?.dailyLimit ?? Number(process.env.SMS_DAILY_LIMIT ?? 500);
    const monthlyLimit = config?.monthlyLimit ?? Number(process.env.SMS_MONTHLY_LIMIT ?? 10000);
    const monthlyCostLimit = Number(process.env.SMS_COST_LIMIT ?? 500);
    const costPerMessage = config
      ? Number(config.costPerMessage.toString())
      : Number(process.env.SMS_COST_PER_MESSAGE ?? 0.05);

    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [dailyCount, monthlyCount] = await Promise.all([
      this.prisma.smsMessage.count({
        where: { provider, sentAt: { gte: startOfDay } },
      }),
      this.prisma.smsMessage.count({
        where: { provider, sentAt: { gte: startOfMonth } },
      }),
    ]);

    if (dailyCount >= dailyLimit) {
      throw new ConflictError('Daily SMS limit reached.');
    }
    if (monthlyCount >= monthlyLimit) {
      throw new ConflictError('Monthly SMS limit reached.');
    }
    if ((monthlyCount + 1) * costPerMessage > monthlyCostLimit) {
      throw new ConflictError('Monthly SMS cost limit reached.');
    }
    return costPerMessage;
  }

  private async handleFailure(messageId: string, error: unknown): Promise<void> {
    const message = await this.prisma.smsMessage.findUnique({ where: { id: messageId } });
    if (!message || message.status !== QUEUED) return;

    const attempts = message.attempts + 1;
    const maxAttempts = Number(process.env.SMS_MAX_ATTEMPTS ?? 5);
    const lastError = (error as Error).message.slice(0, 500) || 'SMS send failed.';

    if (attempts >= maxAttempts || error instanceof ConflictError) {
      await this.prisma.smsMessage.update({
        where: { id: message.id },
        data: {
          status: FAILED,
          attempts,
          lastError,
          nextAttemptAt: null,
        },
      });
      await this.prisma.smsDeadLetter.upsert({
        where: { messageId: message.id },
        create: {
          messageId: message.id,
          reason: lastError,
          attempts,
          event: { idempotencyKey: message.idempotencyKey, relatedId: message.relatedId },
        },
        update: { reason: lastError, attempts },
      });
      await this.collectionStatus.update(message.relatedId, 'FAILED', message.id);
      await this.outbox.append(
        'sms.failed',
        {
          messageId: message.id,
          reason: lastError,
          attempts,
          relatedType: message.relatedType,
          relatedId: message.relatedId,
        },
        { type: 'SYSTEM' },
      );
      await this.audit.record({
        action: 'sms.dead_lettered',
        entityType: 'SmsMessage',
        entityId: message.id,
        metadata: { attempts, reason: lastError },
      });
      this.logger.warn(`SMS ${message.id} moved to DLQ after ${attempts} attempt(s).`);
      return;
    }

    const baseMs = Number(process.env.SMS_RETRY_BASE_MS ?? 60000);
    const nextAttemptAt = new Date(Date.now() + baseMs * 2 ** (attempts - 1));
    await this.prisma.smsMessage.update({
      where: { id: message.id },
      data: { attempts, lastError, nextAttemptAt },
    });
    await this.audit.record({
      action: 'sms.retry_scheduled',
      entityType: 'SmsMessage',
      entityId: message.id,
      metadata: { attempts, nextAttemptAt: nextAttemptAt.toISOString() },
    });
  }
}

export { DELIVERED, FAILED, QUEUED, SENT };

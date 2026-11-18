import { ConflictError, NotFoundError, ValidationError } from '@galatura/platform-kit';
import { Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '../../generated/prisma';
import { AuditService } from '../audit/audit.service';
import { CollectionStatusService } from '../collection/collection-status.service';
import { OutboxService } from '../outbox/outbox.service';
import { PhoneService } from '../phone/phone.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsDispatchService } from './sms-dispatch.service';
import { serializeMessage, type SmsMessageDto } from './sms.serializer';

@Injectable()
export class SmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phone: PhoneService,
    private readonly dispatch: SmsDispatchService,
    private readonly collectionStatus: CollectionStatusService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async list(query: {
    status?: string;
    relatedId?: string;
    cursor?: string;
    limit?: string;
  }): Promise<{
    data: SmsMessageDto[];
    page: { next: string | null; limit: number; total: number };
  }> {
    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);
    const where: Prisma.SmsMessageWhereInput = {};
    if (query.status) {
      if (!$Enums.SmsMessageStatus[query.status as keyof typeof $Enums.SmsMessageStatus]) {
        throw new ValidationError('Unknown SMS status.');
      }
      where.status = query.status as $Enums.SmsMessageStatus;
    }
    if (query.relatedId) where.relatedId = query.relatedId;
    if (query.cursor) where.id = { lt: query.cursor };

    const total = await this.prisma.smsMessage.count({
      where: {
        ...(query.status ? { status: where.status } : {}),
        ...(query.relatedId ? { relatedId: query.relatedId } : {}),
      },
    });
    const messages = await this.prisma.smsMessage.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const next = messages.length > limit ? messages[limit].id : null;
    const data = await Promise.all(
      messages.slice(0, limit).map((m) => serializeMessage(m, this.phone)),
    );
    return { data, page: { next, limit, total } };
  }

  async get(id: string): Promise<SmsMessageDto> {
    const message = await this.prisma.smsMessage.findUnique({ where: { id } });
    if (!message) throw new NotFoundError('SMS message not found.');
    return serializeMessage(message, this.phone);
  }

  async resend(id: string, actorId?: string): Promise<SmsMessageDto> {
    const message = await this.prisma.smsMessage.findUnique({ where: { id } });
    if (!message) throw new NotFoundError('SMS message not found.');
    if (message.status !== $Enums.SmsMessageStatus.FAILED) {
      throw new ConflictError('Only failed SMS messages can be resent.');
    }

    await this.prisma.smsMessage.update({
      where: { id },
      data: {
        status: $Enums.SmsMessageStatus.QUEUED,
        attempts: 0,
        lastError: null,
        nextAttemptAt: null,
        providerMessageId: null,
        sentAt: null,
        deliveredAt: null,
        costEstimate: null,
        queuedAt: new Date(),
      },
    });
    await this.outbox.append(
      'sms.queued',
      {
        messageId: id,
        relatedType: message.relatedType,
        relatedId: message.relatedId,
        reason: 'RESEND',
      },
      actorId ? { type: 'USER', id: actorId } : { type: 'SYSTEM' },
    );
    await this.audit.record({
      actorId,
      action: 'sms.resend',
      entityType: 'SmsMessage',
      entityId: id,
    });
    await this.collectionStatus.update(message.relatedId, 'PENDING', id, actorId);
    await this.dispatch.dispatch(id);
    return this.get(id);
  }

  async listDeadLetters(): Promise<
    Array<{ id: string; messageId: string; reason: string; attempts: number; createdAt: string }>
  > {
    const entries = await this.prisma.smsDeadLetter.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return entries.map((entry) => ({
      id: entry.id,
      messageId: entry.messageId,
      reason: entry.reason,
      attempts: entry.attempts,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  async replayDeadLetter(id: string, actorId?: string): Promise<SmsMessageDto> {
    const entry = await this.prisma.smsDeadLetter.findUnique({ where: { id } });
    if (!entry) throw new NotFoundError('Dead-letter entry not found.');
    await this.audit.record({
      actorId,
      action: 'sms.dead_letter_replay',
      entityType: 'SmsDeadLetter',
      entityId: id,
    });
    return this.resend(entry.messageId, actorId);
  }
}

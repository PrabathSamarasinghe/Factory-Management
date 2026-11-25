import { Injectable } from '@nestjs/common';
import { uuidv7, type EventEnvelope } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import type { ConsentWithdrawnPayload } from '../events/consent.events';

export interface ConsentWithdrawalResult {
  status: 'processed' | 'duplicate' | 'ignored';
  personId: string;
  revokedTemplates: number;
}

@Injectable()
export class ConsentWithdrawalService {
  constructor(private readonly prisma: PrismaService) {}

  async handle(
    event: EventEnvelope<ConsentWithdrawnPayload>,
  ): Promise<ConsentWithdrawalResult> {
    const payload = event.payload;
    if (payload.consentType !== 'BIOMETRIC') {
      return { status: 'ignored', personId: payload.personId, revokedTemplates: 0 };
    }

    const existing = await this.prisma.consentWithdrawalInbox.findUnique({
      where: { id: event.id },
    });
    if (existing) {
      return { status: 'duplicate', personId: payload.personId, revokedTemplates: 0 };
    }

    const processedAt = new Date();
    const revokedTemplates = await this.prisma.$transaction(async (tx: any) => {
      await tx.consentWithdrawalInbox.create({
        data: {
          id: event.id,
          personId: payload.personId,
          eventType: event.type,
          processedAt,
        },
      });

      const revoked = await tx.faceTemplate.updateMany({
        where: { personId: payload.personId, isActive: true },
        data: {
          isActive: false,
          templateEnc: '',
          revokedAt: processedAt,
          revokeReason: 'CONSENT_WITHDRAWN',
        },
      });

      await tx.attendanceAuditLog.create({
        data: {
          id: uuidv7(),
          actorId: event.actor?.id ?? null,
          actorType: event.actor?.type ?? 'SYSTEM',
          action: 'face.templates.revoked',
          entityType: 'person',
          entityId: payload.personId,
          metadata: {
            reason: 'CONSENT_WITHDRAWN',
            eventId: event.id,
            consentId: payload.consentId,
          },
          ip: null,
          at: processedAt,
        },
      });

      return revoked.count as number;
    });

    return { status: 'processed', personId: payload.personId, revokedTemplates };
  }
}

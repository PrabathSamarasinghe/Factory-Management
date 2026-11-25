import { afterEach, describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError, createEvent, isUuid, uuidv7 } from '@galatura/platform-kit';
import { assertInternalServiceToken } from '../src/events/internal-auth';
import { assertConsentWithdrawalEvent } from '../src/events/consent.events';
import { ConsentWithdrawalService } from '../src/consent-withdrawal/consent-withdrawal.service';

const personId = '11111111-1111-4111-8111-111111111111';
const originalToken = process.env.INTERNAL_SERVICE_TOKEN;

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.INTERNAL_SERVICE_TOKEN;
  } else {
    process.env.INTERNAL_SERVICE_TOKEN = originalToken;
  }
});

function buildPrisma() {
  const templates = [
    { id: uuidv7(), personId, templateEnc: 'encrypted-1', isActive: true, revokedAt: null },
    { id: uuidv7(), personId, templateEnc: 'encrypted-2', isActive: true, revokedAt: null },
  ];
  const inbox: any[] = [];
  const audits: any[] = [];
  const prisma: any = {
    $transaction: async (fn: any) => fn(prisma),
    consentWithdrawalInbox: {
      findUnique: async (args: any) => inbox.find((row) => row.id === args.where.id) ?? null,
      create: async (args: any) => {
        inbox.push(args.data);
        return args.data;
      },
    },
    faceTemplate: {
      updateMany: async (args: any) => {
        const rows = templates.filter(
          (row) => row.personId === args.where.personId && row.isActive === args.where.isActive,
        );
        for (const row of rows) {
          Object.assign(row, args.data);
        }
        return { count: rows.length };
      },
    },
    attendanceAuditLog: {
      create: async (args: any) => {
        audits.push(args.data);
        return args.data;
      },
    },
    __templates: templates,
    __inbox: inbox,
    __audits: audits,
  };
  return prisma;
}

function withdrawalEvent() {
  return createEvent({
    type: 'people.consent.withdrawn',
    version: 1,
    producer: 'people-service',
    actor: { type: 'USER', id: 'user-1' },
    payload: {
      personId,
      consentId: 'consent-1',
      consentType: 'BIOMETRIC' as const,
      withdrawnAt: new Date().toISOString(),
    },
  });
}

describe('consent withdrawal intake', () => {
  it('requires the internal service token and a valid event contract', () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'local-test-token';
    expect(() => assertInternalServiceToken({ headers: {} } as any)).toThrow(ForbiddenError);
    expect(() =>
      assertInternalServiceToken({ headers: { 'x-internal-token': 'local-test-token' } } as any),
    ).not.toThrow();
    expect(() => assertConsentWithdrawalEvent({ type: 'other.event' })).toThrow(ValidationError);

    const event = withdrawalEvent();
    expect(() => assertConsentWithdrawalEvent(event)).not.toThrow();
    expect(isUuid(event.id)).toBe(true);
  });

  it('revokes active face templates once and records the withdrawal', async () => {
    const prisma = buildPrisma();
    const service = new ConsentWithdrawalService(prisma);
    const event = withdrawalEvent();

    const first = await service.handle(event);
    expect(first).toEqual({ status: 'processed', personId, revokedTemplates: 2 });
    expect(prisma.__templates.every((template: any) => !template.isActive)).toBe(true);
    expect(prisma.__templates.every((template: any) => template.templateEnc === '')).toBe(true);
    expect(prisma.__templates.every((template: any) => template.revokeReason === 'CONSENT_WITHDRAWN')).toBe(
      true,
    );
    expect(prisma.__audits[0]).toMatchObject({
      action: 'face.templates.revoked',
      entityId: personId,
      actorId: 'user-1',
    });

    const duplicate = await service.handle(event);
    expect(duplicate.status).toBe('duplicate');
    expect(prisma.__inbox).toHaveLength(1);
  });
});

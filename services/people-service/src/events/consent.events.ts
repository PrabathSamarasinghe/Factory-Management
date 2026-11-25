import { createEvent, type Actor, type EventEnvelope } from '@galatura/platform-kit';
import { ConsentType } from '../../generated/prisma';

export const CONSENT_WITHDRAWN_EVENT = 'people.consent.withdrawn';
export const CONSENT_WITHDRAWN_VERSION = 1;

export interface ConsentWithdrawnPayload {
  personId: string;
  consentId: string;
  consentType: ConsentType;
  withdrawnAt: string;
  evidenceObjectKey?: string;
}

export function createConsentWithdrawnEvent(input: {
  personId: string;
  consentId: string;
  consentType: ConsentType;
  withdrawnAt: string;
  evidenceObjectKey?: string;
  actor: Actor;
  correlationId?: string;
}): EventEnvelope<ConsentWithdrawnPayload> {
  return createEvent({
    type: CONSENT_WITHDRAWN_EVENT,
    version: CONSENT_WITHDRAWN_VERSION,
    producer: 'people-service',
    actor: input.actor,
    correlationId: input.correlationId,
    occurredAt: new Date(input.withdrawnAt),
    payload: {
      personId: input.personId,
      consentId: input.consentId,
      consentType: input.consentType,
      withdrawnAt: input.withdrawnAt,
      ...(input.evidenceObjectKey ? { evidenceObjectKey: input.evidenceObjectKey } : {}),
    },
  });
}

import { ValidationError, isUuid } from '@galatura/platform-kit';
import type { EventEnvelope } from '@galatura/platform-kit';

export const CONSENT_WITHDRAWN_EVENT = 'people.consent.withdrawn';
export const CONSENT_WITHDRAWN_VERSION = 1;

export interface ConsentWithdrawnPayload {
  personId: string;
  consentId: string;
  consentType: 'BIOMETRIC' | 'SMS' | 'DATA_PROCESSING';
  withdrawnAt: string;
  evidenceObjectKey?: string;
}

const CONSENT_TYPES = new Set(['BIOMETRIC', 'SMS', 'DATA_PROCESSING']);

export function assertConsentWithdrawalEvent(
  value: unknown,
): asserts value is EventEnvelope<ConsentWithdrawnPayload> {
  if (!isEventEnvelope(value)) {
    throw new ValidationError('A consent withdrawal event envelope is required.');
  }
  if (value.type !== CONSENT_WITHDRAWN_EVENT || value.version !== CONSENT_WITHDRAWN_VERSION) {
    throw new ValidationError('Unsupported consent withdrawal event type or version.');
  }
  const payload = value.payload as Partial<ConsentWithdrawnPayload> | undefined;
  if (
    !payload ||
    !isUuid(payload.personId ?? '') ||
    typeof payload.consentId !== 'string' ||
    payload.consentId.length === 0 ||
    !CONSENT_TYPES.has(payload.consentType ?? '') ||
    typeof payload.withdrawnAt !== 'string' ||
    Number.isNaN(Date.parse(payload.withdrawnAt))
  ) {
    throw new ValidationError('The consent withdrawal event payload is invalid.');
  }
}

function isEventEnvelope(value: unknown): value is EventEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<EventEnvelope>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.version === 'number' &&
    typeof candidate.occurredAt === 'string' &&
    !!candidate.actor &&
    typeof candidate.actor === 'object' &&
    !!candidate.payload
  );
}

import type { $Enums, SmsMessage } from '../../generated/prisma';
import { PhoneService } from '../phone/phone.service';

export interface SmsMessageDto {
  id: string;
  recipientMasked: string;
  templateCode: string;
  relatedType: string;
  relatedId: string;
  status: $Enums.SmsMessageStatus;
  attempts: number;
  provider: string;
  providerMessageId: string | null;
  lastError: string | null;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}

export async function serializeMessage(
  message: SmsMessage,
  phone: PhoneService,
): Promise<SmsMessageDto> {
  let recipientMasked = '[REDACTED]';
  try {
    recipientMasked = phone.mask(await phone.decrypt(message.recipientPhoneEnc));
  } catch {
    recipientMasked = '[REDACTED]';
  }

  return {
    id: message.id,
    recipientMasked,
    templateCode: message.templateCode,
    relatedType: message.relatedType,
    relatedId: message.relatedId,
    status: message.status,
    attempts: message.attempts,
    provider: message.provider,
    providerMessageId: message.providerMessageId,
    lastError: message.lastError,
    queuedAt: message.queuedAt.toISOString(),
    sentAt: message.sentAt?.toISOString() ?? null,
    deliveredAt: message.deliveredAt?.toISOString() ?? null,
  };
}

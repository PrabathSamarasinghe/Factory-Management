import { Injectable, Logger } from '@nestjs/common';
import { DependencyUnavailableError, uuidv7 } from '@galatura/platform-kit';

export interface SmsProviderInput {
  to: string;
  text: string;
  senderId: string;
  clientReference: string;
}

export interface SmsProviderResult {
  providerMessageId: string;
  status: 'SENT' | 'DELIVERED';
  costEstimate?: number;
}

@Injectable()
export class SmsProviderService {
  private readonly logger = new Logger(SmsProviderService.name);

  async send(input: SmsProviderInput): Promise<SmsProviderResult> {
    const provider = (process.env.SMS_PROVIDER || 'FAKE').toUpperCase();
    if (provider === 'FAKE') {
      return { providerMessageId: `fake-${uuidv7()}`, status: 'SENT' };
    }
    if (provider !== 'HTTP') {
      throw new DependencyUnavailableError(`Unsupported SMS provider "${provider}".`);
    }

    const url = process.env.SMS_PROVIDER_URL;
    if (!url) {
      throw new DependencyUnavailableError('SMS_PROVIDER_URL is required for the HTTP provider.');
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': input.clientReference,
          ...(process.env.SMS_PROVIDER_API_KEY
            ? { authorization: `Bearer ${process.env.SMS_PROVIDER_API_KEY}` }
            : {}),
        },
        body: JSON.stringify({
          to: input.to,
          from: input.senderId,
          text: input.text,
          clientReference: input.clientReference,
        }),
        signal: AbortSignal.timeout(Number(process.env.SMS_PROVIDER_TIMEOUT_MS ?? 10000)),
      });
      if (!response.ok) {
        throw new Error(`provider returned ${response.status}`);
      }

      const result = (await response.json()) as {
        messageId?: string;
        status?: string;
        cost?: number;
      };
      if (!result.messageId) {
        throw new Error('provider response did not include messageId');
      }
      return {
        providerMessageId: result.messageId,
        status: result.status === 'DELIVERED' ? 'DELIVERED' : 'SENT',
        ...(typeof result.cost === 'number' ? { costEstimate: result.cost } : {}),
      };
    } catch (error) {
      this.logger.warn(`SMS provider send failed: ${(error as Error).message}`);
      throw new DependencyUnavailableError('SMS provider is unavailable.');
    }
  }
}

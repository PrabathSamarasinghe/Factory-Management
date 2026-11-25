import { Injectable } from '@nestjs/common';
import {
  DependencyUnavailableError,
  OutboxPublisher,
  type EventBus,
  type EventEnvelope,
} from '@galatura/platform-kit';
import { OutboxService } from '../outbox/outbox.service';

export const CONSENT_WITHDRAWAL_PATH = '/internal/consent-withdrawals';

export class HttpConsentWithdrawalBus implements EventBus {
  constructor(
    private readonly baseUrl: string = process.env.ATTENDANCE_SERVICE_URL || 'http://localhost:3003',
    private readonly token: string | undefined = process.env.INTERNAL_SERVICE_TOKEN,
  ) {}

  async publish(event: EventEnvelope): Promise<void> {
    if (!this.token) {
      throw new DependencyUnavailableError(
        'INTERNAL_SERVICE_TOKEN is required to publish consent withdrawal events.',
      );
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${CONSENT_WITHDRAWAL_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': this.token,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new DependencyUnavailableError('The attendance service is unavailable.', {
        cause: error,
      });
    }
    if (!response.ok) {
      throw new DependencyUnavailableError(
        `The attendance service rejected a consent withdrawal event with HTTP ${response.status}.`,
      );
    }
  }
}

@Injectable()
export class ConsentWithdrawalDispatcher {
  constructor(
    private readonly outbox: OutboxService,
    private readonly bus: EventBus = new HttpConsentWithdrawalBus(),
  ) {}

  async publishPending(): Promise<{ published: number; failed: number }> {
    return new OutboxPublisher(this.outbox, this.bus).publishPending();
  }
}

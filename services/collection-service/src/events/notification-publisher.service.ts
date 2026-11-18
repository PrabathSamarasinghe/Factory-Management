import { Injectable, Logger } from '@nestjs/common';
import type { EventEnvelope } from '@galatura/platform-kit';

@Injectable()
export class NotificationPublisherService {
  private readonly logger = new Logger(NotificationPublisherService.name);

  async publishFinalized(events: EventEnvelope[]): Promise<void> {
    if (events.length === 0) return;
    const base = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006';
    const results = await Promise.allSettled(
      events.map(async (event) => {
        const response = await fetch(`${base}/events/collection-finalized`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-permissions': JSON.stringify(['sms:ingest']),
            'x-service': 'collection-service',
            ...(process.env.NOTIFICATION_INGEST_TOKEN
              ? { 'x-service-token': process.env.NOTIFICATION_INGEST_TOKEN }
              : {}),
          },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(Number(process.env.NOTIFICATION_TIMEOUT_MS ?? 5000)),
        });
        if (!response.ok) {
          throw new Error(`notification service returned ${response.status}`);
        }
      }),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Could not dispatch collection.finalized to notification service: ${(result.reason as Error).message}`,
        );
      }
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';

export type CollectionSmsStatus = 'NOT_REQUIRED' | 'PENDING' | 'SENT' | 'FAILED';

@Injectable()
export class CollectionStatusService {
  private readonly logger = new Logger(CollectionStatusService.name);

  async update(
    dailyTotalId: string,
    status: CollectionSmsStatus,
    smsMessageId?: string,
    actorId?: string,
  ): Promise<void> {
    const base = process.env.COLLECTION_SERVICE_URL || 'http://localhost:3005';
    try {
      const response = await fetch(`${base}/totals/${dailyTotalId}/sms-status`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-permissions': JSON.stringify(['collection:review']),
          'x-service': 'notification-service',
          ...(actorId ? { 'x-user-id': actorId } : {}),
        },
        body: JSON.stringify({ smsStatus: status, smsMessageId }),
        signal: AbortSignal.timeout(Number(process.env.SERVICE_TIMEOUT_MS ?? 5000)),
      });
      if (!response.ok) {
        this.logger.warn(`Collection status callback returned ${response.status}.`);
      }
    } catch (error) {
      this.logger.warn(`Collection status callback failed: ${(error as Error).message}`);
    }
  }
}

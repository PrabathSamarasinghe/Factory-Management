import { Injectable } from '@nestjs/common';
import { createEvent, type Actor, type EventEnvelope } from '@galatura/platform-kit';

@Injectable()
export class OutboxService {
  async append(
    type: string,
    payload: Record<string, unknown>,
    actor: Actor,
  ): Promise<EventEnvelope> {
    return createEvent({ type, payload, actor, producer: 'reporting-service' });
  }
}

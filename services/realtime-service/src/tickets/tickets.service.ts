import { Injectable } from '@nestjs/common';
import { ForbiddenError, ValidationError, randomToken } from '@galatura/platform-kit';
import { AuditService } from '../audit/audit.service';
import { canSubscribe, channelsForPrincipal, isChannel } from '../events/channel-map';

export const TICKET_TTL_MS = 30_000;

export interface TicketRecord {
  token: string;
  principalId: string;
  clientApp: string;
  permissions: string[];
  channels: string[];
  createdAt: Date;
  expiresAt: Date;
}

export interface IssueTicketInput {
  principalId: string;
  clientApp?: string;
  permissions: string[];
  channels?: string[];
}

export function isTicketValid(ticket: TicketRecord | undefined, now: Date): ticket is TicketRecord {
  return Boolean(ticket && ticket.expiresAt.getTime() > now.getTime());
}

export function consumeTicket(
  store: Map<string, TicketRecord>,
  token: string | undefined,
  now: Date,
): TicketRecord | null {
  if (!token) return null;
  const ticket = store.get(token);
  store.delete(token);
  return isTicketValid(ticket, now) ? ticket : null;
}

@Injectable()
export class TicketsService {
  clock: () => Date = () => new Date();
  tokenFactory: () => string = () => randomToken(24);
  private readonly store = new Map<string, TicketRecord>();

  constructor(private readonly audit: AuditService) {}

  get size(): number {
    return this.store.size;
  }

  issue(input: IssueTicketInput): { ticket: string; expiresAt: string; channels: string[] } {
    const principalId = input.principalId.trim();
    if (!principalId) throw new ValidationError('principalId is required.');

    const permissions = [...new Set(input.permissions ?? [])];
    const requested = input.channels
      ? [...new Set(input.channels)]
      : channelsForPrincipal(permissions);
    for (const channel of requested) {
      if (!isChannel(channel)) throw new ValidationError(`Unknown channel "${channel}".`);
      if (!canSubscribe(permissions, channel)) {
        throw new ForbiddenError(`Not authorized for channel "${channel}".`);
      }
    }

    const now = this.clock();
    const token = this.tokenFactory();
    const record: TicketRecord = {
      token,
      principalId,
      clientApp: input.clientApp?.trim() || 'unknown',
      permissions,
      channels: requested,
      createdAt: now,
      expiresAt: new Date(now.getTime() + TICKET_TTL_MS),
    };
    this.store.set(token, record);
    this.audit.record({
      action: 'ticket.issued',
      entityType: 'RealtimeTicket',
      entityId: principalId,
      details: { channels: requested, clientApp: record.clientApp },
      now,
    });

    return { ticket: token, expiresAt: record.expiresAt.toISOString(), channels: requested };
  }

  consume(token: string | undefined, now: Date = this.clock()): TicketRecord | null {
    return consumeTicket(this.store, token, now);
  }
}

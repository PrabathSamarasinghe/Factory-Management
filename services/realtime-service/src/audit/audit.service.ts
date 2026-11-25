import { Injectable, Logger } from '@nestjs/common';
import { redactObject } from '@galatura/platform-kit';

export interface RealtimeAuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  at: Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  readonly entries: RealtimeAuditEntry[] = [];

  record(entry: {
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, unknown>;
    now?: Date;
  }): void {
    const saved: RealtimeAuditEntry = {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: redactObject(entry.details ?? {}),
      at: entry.now ?? new Date(),
    };
    this.entries.push(saved);
    this.logger.debug(`${saved.action} ${saved.entityType} ${saved.entityId}`);
  }
}

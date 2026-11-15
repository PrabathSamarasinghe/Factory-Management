import type { AuditService } from '../audit';
import type { ActorType } from '../types';
import { isRecord, type PrismaExtension, type PrismaQueryEvent } from './types';

export const AUDITED_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

export interface PrismaAuditActor {
  actorId: string;
  actorType: ActorType;
}

export interface PrismaAuditModelOptions {
  entityType?: string;
  /** Override the default `<entityType>.<operation>` action name. */
  actions?: Partial<Record<string, string>>;
  entityId?: (event: PrismaQueryEvent, result: unknown) => string | undefined;
}

export interface PrismaAuditOptions {
  audit: AuditService;
  /** Model names as they appear in the generated Prisma client. */
  models: Record<string, PrismaAuditModelOptions | true>;
  actor: (event: PrismaQueryEvent) => PrismaAuditActor | undefined;
  /** Load the pre-change record for update/delete operations. */
  before?: (event: PrismaQueryEvent) => Promise<unknown> | unknown;
  requestId?: (event: PrismaQueryEvent) => string | undefined;
  ip?: (event: PrismaQueryEvent) => string | undefined;
  userAgent?: (event: PrismaQueryEvent) => string | undefined;
  metadata?: (event: PrismaQueryEvent) => Record<string, unknown> | undefined;
  /** Keep the mutation result when audit persistence fails. Default false (fail closed). */
  failOpen?: boolean;
}

/**
 * Records create/update/delete mutations through `AuditService`. The `after`
 * value is the Prisma result; provide `before` if the audit trail must contain
 * the previous state. For money/stock mutations, write the audit entry in the
 * same database transaction with a transactional audit sink.
 */
export function createPrismaAuditExtension(options: PrismaAuditOptions): PrismaExtension {
  return {
    name: 'platform-kit-audit',
    query: {
      $allModels: {
        async $allOperations(event) {
          const { model, operation, args, query } = event;
          if (!model || !options.models[model] || !AUDITED_OPERATIONS.has(operation)) {
            return query(args);
          }

          const before = options.before ? await options.before(event) : undefined;
          const result = await query(args);

          try {
            const actor = options.actor(event);
            if (!actor) {
              throw new Error(`No audit actor configured for ${model}.${operation}.`);
            }

            const modelOptions = options.models[model];
            const entityType =
              modelOptions === true
                ? lowerFirst(model)
                : (modelOptions.entityType ?? lowerFirst(model));
            const action =
              modelOptions === true
                ? `${entityType}.${operation}`
                : (modelOptions.actions?.[operation] ?? `${entityType}.${operation}`);
            const entityId =
              (modelOptions === true ? undefined : modelOptions.entityId?.(event, result)) ??
              defaultEntityId(event, result) ??
              'bulk';

            await options.audit.record({
              actorId: actor.actorId,
              actorType: actor.actorType,
              action,
              entityType,
              entityId,
              before,
              after: result,
              requestId: options.requestId?.(event),
              ip: options.ip?.(event),
              userAgent: options.userAgent?.(event),
              metadata: {
                model,
                operation,
                ...options.metadata?.(event),
              },
            });
          } catch (error) {
            if (!options.failOpen) {
              throw error;
            }
          }

          return result;
        },
      },
    },
  };
}

function defaultEntityId(event: PrismaQueryEvent, result: unknown): string | undefined {
  if (isRecord(result) && typeof result.id === 'string') {
    return result.id;
  }
  const where = event.args.where;
  if (isRecord(where) && typeof where.id === 'string') {
    return where.id;
  }
  return undefined;
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : value[0].toLowerCase() + value.slice(1);
}

import {
  isRecord,
  type PrismaClientLike,
  type PrismaExtension,
  type PrismaModelDelegate,
  type PrismaQueryArgs,
  type PrismaQueryEvent,
} from './types';

export interface SoftDeleteModelOptions {
  deletedAtField?: string;
  deletedByField?: string;
}

export interface SoftDeleteOptions {
  /** Model names as they appear in the generated Prisma client, e.g. `Person`. */
  models: Record<string, SoftDeleteModelOptions | true>;
  /** Default `deletedAt` field for all configured models. */
  deletedAtField?: string;
  /** Default `deletedBy` field for all configured models. */
  deletedByField?: string;
  /** Custom argument used to include deleted rows. Removed before Prisma sees it. */
  includeDeletedArg?: string;
  clock?: () => Date;
  deletedBy?: (event: PrismaQueryEvent) => string | undefined;
}

const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
]);

const HARD_DELETE_OPERATIONS = new Set(['delete', 'deleteMany']);

/**
 * Adds `deletedAt: null` filters and turns hard deletes into soft deletes.
 * Use `{ includeDeleted: true }` (or a custom arg) to bypass the filter.
 * Hard deletes remain possible through raw SQL and should be denied by the
 * database role for tables that must keep history.
 */
export function createSoftDeleteExtension(
  client: PrismaClientLike,
  options: SoftDeleteOptions,
): PrismaExtension {
  const includeDeletedArg = options.includeDeletedArg ?? 'includeDeleted';
  const defaultDeletedAt = options.deletedAtField ?? 'deletedAt';
  const defaultDeletedBy = options.deletedByField ?? 'deletedBy';

  return {
    name: 'platform-kit-soft-delete',
    query: {
      $allModels: {
        async $allOperations(event) {
          const { model, operation, query } = event;
          if (!model || !options.models[model]) {
            return query(event.args);
          }

          const args = { ...event.args };
          const includeDeleted = args[includeDeletedArg] === true;
          delete args[includeDeletedArg];

          const modelOptions = options.models[model];
          const deletedAtField =
            modelOptions === true
              ? defaultDeletedAt
              : (modelOptions.deletedAtField ?? defaultDeletedAt);
          const deletedByField =
            modelOptions === true
              ? defaultDeletedBy
              : (modelOptions.deletedByField ?? defaultDeletedBy);

          if (HARD_DELETE_OPERATIONS.has(operation)) {
            const deletedAt = (options.clock?.() ?? new Date()).toISOString();
            const deletedBy = options.deletedBy?.(event);
            const data: PrismaQueryArgs = { [deletedAtField]: deletedAt };
            if (deletedBy !== undefined) {
              data[deletedByField] = deletedBy;
            }

            const delegates = client as Record<string, PrismaModelDelegate>;
            const delegate = delegates[model] ?? delegates[lowerFirst(model)];
            if (!delegate) {
              throw new Error(`Prisma model delegate not found for ${model}.`);
            }

            if (operation === 'delete') {
              return delegate.update({
                where: withDeletedAtFilter(args.where, deletedAtField),
                data,
                select: args.select,
                include: args.include,
              });
            }

            return delegate.updateMany({
              where: withDeletedAtFilter(args.where, deletedAtField),
              data,
              limit: args.limit,
            });
          }

          if (!includeDeleted && READ_OPERATIONS.has(operation)) {
            args.where = withDeletedAtFilter(args.where, deletedAtField);
          }

          return query(args);
        },
      },
    },
  };
}

function withDeletedAtFilter(where: unknown, field: string): PrismaQueryArgs {
  const base = isRecord(where) ? where : {};
  return { ...base, [field]: null };
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : value[0].toLowerCase() + value.slice(1);
}

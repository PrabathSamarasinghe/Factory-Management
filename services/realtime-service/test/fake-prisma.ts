import { uuidv7 } from '@galatura/platform-kit';

type Store = Record<string, any[]>;

export function createFakePrisma(seed: Store = {}): any {
  const stores: Store = {};
  for (const [model, rows] of Object.entries(seed)) {
    stores[model] = rows.map((row) => ({ ...row }));
  }

  const collection = (model: string) => {
    if (!stores[model]) stores[model] = [];
    return stores[model];
  };

  const findRow = (model: string, where: any) =>
    collection(model).find((row) => matches(row, expandWhere(where ?? {}))) ?? null;

  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
    __stores: stores,
  };

  const models = [
    'realtimeConnection',
    'realtimeEvent',
    'webhookSubscription',
    'webhookDelivery',
    'processedEvent',
    'pushToken',
  ];

  for (const model of models) {
    if (!stores[model]) stores[model] = [];
    prisma[model] = {
      findUnique: async (args: any) => clone(findRow(model, args?.where)),
      findFirst: async (args: any) =>
        clone(
          collection(model).find((row) => matches(row, expandWhere(args?.where ?? {}))) ?? null,
        ),
      findMany: async (args: any) => {
        const rows = collection(model).filter((row) =>
          matches(row, expandWhere(args?.where ?? {})),
        );
        const orderBy = Array.isArray(args?.orderBy)
          ? args.orderBy
          : args?.orderBy
            ? [args.orderBy]
            : [];
        for (let index = orderBy.length - 1; index >= 0; index -= 1) {
          const [field, direction] = Object.entries(orderBy[index])[0] as [string, any];
          rows.sort((left, right) => {
            const comparison = compare(left[field], right[field]);
            return direction === 'desc' ? -comparison : comparison;
          });
        }
        return rows.map(clone);
      },
      create: async (args: any) => {
        const row = {
          id: args.data.id ?? uuidv7(),
          createdAt: new Date(),
          ...args.data,
        };
        collection(model).push(row);
        return clone(row);
      },
      update: async (args: any) => {
        const row = findRow(model, args?.where);
        if (!row) throw new Error(`${model} not found.`);
        Object.assign(row, args.data);
        return clone(row);
      },
      updateMany: async (args: any) => {
        const rows = collection(model).filter((row) =>
          matches(row, expandWhere(args?.where ?? {})),
        );
        for (const row of rows) Object.assign(row, args.data);
        return { count: rows.length };
      },
      upsert: async (args: any) => {
        const row = findRow(model, args?.where);
        if (row) {
          Object.assign(row, args.update ?? {});
          return clone(row);
        }
        return prisma[model].create({
          data: { ...expandWhere(args?.where ?? {}), ...(args.create ?? {}) },
        });
      },
      count: async (args: any) =>
        collection(model).filter((row) => matches(row, expandWhere(args?.where ?? {}))).length,
      delete: async (args: any) => {
        const row = findRow(model, args?.where);
        if (!row) throw new Error(`${model} not found.`);
        collection(model).splice(collection(model).indexOf(row), 1);
        return clone(row);
      },
    };
  }

  return prisma;
}

function expandWhere(where: any): any {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where ?? {})) {
    if (key.includes('_') && value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      copy[key] = clone(item);
    }
    return copy as T;
  }
  return value;
}

function matches(row: any, where: any): boolean {
  for (const [key, condition] of Object.entries(where ?? {})) {
    if (key === 'AND') {
      if (!Array.isArray(condition) || !condition.every((part) => matches(row, part))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!Array.isArray(condition) || !condition.some((part) => matches(row, part))) return false;
      continue;
    }
    if (key === 'NOT') {
      if (condition && matches(row, condition)) return false;
      continue;
    }

    const actual = row[key];
    if (condition === undefined) continue;
    if (condition === null) {
      if (actual !== null && actual !== undefined) return false;
      continue;
    }

    if (isDateLike(condition)) {
      if (
        !isDateLike(actual) ||
        new Date(String(actual)).getTime() !== new Date(String(condition)).getTime()
      ) {
        return false;
      }
      continue;
    }

    if (Array.isArray(condition)) {
      if (!condition.some((item) => sameValue(actual, item))) return false;
      continue;
    }

    if (typeof condition === 'object') {
      const operators = ['in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'equals', 'not'];
      if (Object.keys(condition).some((operator) => operators.includes(operator))) {
        for (const [operator, operand] of Object.entries(condition)) {
          if (operator === 'in' && !Array.isArray(operand)) return false;
          if (operator === 'in' && !(operand as any[]).some((item) => sameValue(actual, item)))
            return false;
          if (operator === 'notIn' && (operand as any[]).some((item) => sameValue(actual, item)))
            return false;
          if (operator === 'gt' && !(compare(actual, operand) > 0)) return false;
          if (operator === 'gte' && !(compare(actual, operand) >= 0)) return false;
          if (operator === 'lt' && !(compare(actual, operand) < 0)) return false;
          if (operator === 'lte' && !(compare(actual, operand) <= 0)) return false;
          if (operator === 'equals' && !sameValue(actual, operand)) return false;
          if (operator === 'not' && sameValue(actual, operand)) return false;
        }
        continue;
      }
    }

    if (!sameValue(actual, condition)) return false;
  }
  return true;
}

function sameValue(left: any, right: any): boolean {
  if (isDateLike(left) && isDateLike(right)) {
    return new Date(left).getTime() === new Date(right).getTime();
  }
  return left === right;
}

function isDateLike(value: any): boolean {
  return value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value));
}

function compare(left: any, right: any): number {
  if (isDateLike(left) && isDateLike(right)) {
    return new Date(left).getTime() - new Date(right).getTime();
  }
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left ?? '').localeCompare(String(right ?? ''));
}

export type PrismaQueryArgs = Record<string, unknown>;

export interface PrismaQueryEvent {
  model?: string;
  operation: string;
  args: PrismaQueryArgs;
  query: (args: PrismaQueryArgs) => Promise<unknown>;
}

export interface PrismaExtension {
  name: string;
  query: {
    $allModels: {
      $allOperations: (event: PrismaQueryEvent) => Promise<unknown>;
    };
  };
}

export interface PrismaModelDelegate {
  update(args: PrismaQueryArgs): Promise<unknown>;
  updateMany(args: PrismaQueryArgs): Promise<unknown>;
}

/** Kept deliberately loose so a generated `PrismaClient` is assignable. */
export type PrismaClientLike = object;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

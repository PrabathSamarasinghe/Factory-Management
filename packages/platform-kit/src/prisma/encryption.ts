import { blindIndex, decryptString, encryptString, type KeyProvider } from '../crypto';
import { isPlainRecord, isRecord, type PrismaExtension, type PrismaQueryArgs } from './types';

export interface PrismaBlindIndexOptions {
  field: string;
  key: string | Buffer;
  normalize?: boolean;
  encoding?: 'base64url' | 'hex';
}

export interface PrismaEncryptedField {
  /** Plaintext field name accepted by application code. */
  plain: string;
  /** Ciphertext column stored by Prisma. */
  stored: string;
  /** Optional equality-lookup column. Use a dedicated key, never the KEK. */
  blindIndex?: PrismaBlindIndexOptions;
}

export interface PrismaEncryptionOptions {
  keys: KeyProvider;
  /** Model names as they appear in the generated Prisma client. */
  models: Record<string, PrismaEncryptedField[]>;
}

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
]);

/**
 * Encrypts configured plaintext fields on writes and decrypts their stored
 * columns in query results. Nested relation writes must be encrypted by the
 * caller (or split into separate writes) because Prisma's extension args do not
 * expose a stable nested-write type.
 */
export function createPrismaEncryptionExtension(options: PrismaEncryptionOptions): PrismaExtension {
  const storedFields = collectStoredFields(options.models);

  return {
    name: 'platform-kit-encryption',
    query: {
      $allModels: {
        async $allOperations(event) {
          const fields = event.model ? options.models[event.model] : undefined;
          let args = event.args;

          if (event.model && fields?.length && WRITE_OPERATIONS.has(event.operation)) {
            args = await encryptWriteArgs(event.operation, args, fields, options.keys);
          }

          const result = await event.query(args);
          return decryptResult(result, storedFields, options.keys);
        },
      },
    },
  };
}

export async function encryptWriteArgs(
  operation: string,
  args: PrismaQueryArgs,
  fields: PrismaEncryptedField[],
  keys: KeyProvider,
): Promise<PrismaQueryArgs> {
  const next = { ...args };

  if (operation === 'upsert') {
    next.create = await encryptData(next.create, fields, keys);
    next.update = await encryptData(next.update, fields, keys);
    return next;
  }

  if (
    (operation === 'createMany' || operation === 'createManyAndReturn') &&
    Array.isArray(next.data)
  ) {
    next.data = await Promise.all(next.data.map((item) => encryptData(item, fields, keys)));
    return next;
  }

  if (next.data !== undefined) {
    next.data = await encryptData(next.data, fields, keys);
  }
  return next;
}

export async function encryptData(
  data: unknown,
  fields: PrismaEncryptedField[],
  keys: KeyProvider,
): Promise<unknown> {
  if (!isRecord(data)) {
    return data;
  }

  const next: PrismaQueryArgs = { ...data };
  for (const field of fields) {
    if (!(field.plain in next)) {
      continue;
    }

    const value = next[field.plain];
    delete next[field.plain];

    if (value === undefined) {
      continue;
    }
    if (value === null) {
      next[field.stored] = null;
      if (field.blindIndex) {
        next[field.blindIndex.field] = null;
      }
      continue;
    }

    if (typeof value !== 'string') {
      throw new TypeError(`Encrypted field ${field.plain} must be a string or null.`);
    }

    next[field.stored] = await encryptString(value, keys);
    if (field.blindIndex) {
      next[field.blindIndex.field] = blindIndex(value, field.blindIndex.key, {
        normalize: field.blindIndex.normalize,
        encoding: field.blindIndex.encoding,
      });
    }
  }
  return next;
}

export async function decryptResult(
  result: unknown,
  storedFields: PrismaEncryptedField[],
  keys: KeyProvider,
): Promise<unknown> {
  if (Array.isArray(result)) {
    return Promise.all(result.map((item) => decryptResult(item, storedFields, keys)));
  }
  if (!isPlainRecord(result)) {
    return result;
  }

  const next: PrismaQueryArgs = { ...result };
  for (const field of storedFields) {
    if (!(field.stored in next)) {
      continue;
    }

    const value = next[field.stored];
    delete next[field.stored];

    if (value === null || value === undefined) {
      next[field.plain] = value ?? null;
      continue;
    }
    if (typeof value !== 'string') {
      throw new TypeError(`Encrypted column ${field.stored} must contain a string or null.`);
    }
    next[field.plain] = await decryptString(value, keys);
  }

  await Promise.all(
    Object.keys(next).map(async (key) => {
      next[key] = await decryptResult(next[key], storedFields, keys);
    }),
  );
  return next;
}

function collectStoredFields(
  models: Record<string, PrismaEncryptedField[]>,
): PrismaEncryptedField[] {
  const fields = new Map<string, PrismaEncryptedField>();
  for (const modelFields of Object.values(models)) {
    for (const field of modelFields) {
      if (!fields.has(field.stored)) {
        fields.set(field.stored, field);
      }
    }
  }
  return [...fields.values()];
}

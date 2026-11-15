import { describe, expect, it, vi } from 'vitest';
import {
  AuditService,
  EnvKeyProvider,
  InMemoryAuditSink,
  blindIndex,
  generateMasterKey,
  verifyAuditChain,
} from '../src';
import {
  createPrismaAuditExtension,
  createPrismaEncryptionExtension,
  createSoftDeleteExtension,
  type PrismaExtension,
  type PrismaQueryEvent,
} from '../src/prisma';

function invoke(extension: PrismaExtension, event: PrismaQueryEvent) {
  return extension.query.$allModels.$allOperations(event);
}

describe('soft delete extension', () => {
  it('turns delete into an update and records who deleted the row', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'person-1', deletedAt: 'now' });
    const updateMany = vi.fn();
    const extension = createSoftDeleteExtension(
      { person: { update, updateMany } },
      {
        models: { Person: true },
        clock: () => new Date('2026-11-15T08:00:00.000Z'),
        deletedBy: () => 'user-1',
      },
    );

    const result = await invoke(extension, {
      model: 'Person',
      operation: 'delete',
      args: { where: { id: 'person-1' }, select: { id: true } },
      query: vi.fn(),
    });

    expect(result).toEqual({ id: 'person-1', deletedAt: 'now' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'person-1', deletedAt: null },
      data: { deletedAt: '2026-11-15T08:00:00.000Z', deletedBy: 'user-1' },
      select: { id: true },
      include: undefined,
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('filters reads and updates unless includeDeleted is requested', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const extension = createSoftDeleteExtension(
      { person: { update: vi.fn(), updateMany: vi.fn() } },
      { models: { Person: true } },
    );

    await invoke(extension, {
      model: 'Person',
      operation: 'findMany',
      args: { where: { status: 'ACTIVE' } },
      query,
    });
    expect(query).toHaveBeenCalledWith({ where: { status: 'ACTIVE', deletedAt: null } });

    query.mockClear();
    await invoke(extension, {
      model: 'Person',
      operation: 'findMany',
      args: { where: { status: 'ACTIVE' }, includeDeleted: true },
      query,
    });
    expect(query).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
  });

  it('soft-deletes in bulk and leaves unconfigured models alone', async () => {
    const query = vi.fn().mockResolvedValue({ count: 1 });
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const extension = createSoftDeleteExtension(
      { person: { update: vi.fn(), updateMany } },
      { models: { Person: true }, deletedAtField: 'removedAt' },
    );

    await invoke(extension, {
      model: 'Person',
      operation: 'deleteMany',
      args: { where: { status: 'INACTIVE' } },
      query,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { status: 'INACTIVE', removedAt: null },
      data: { removedAt: expect.any(String) },
      limit: undefined,
    });

    await invoke(extension, {
      model: 'Vehicle',
      operation: 'findMany',
      args: {},
      query,
    });
    expect(query).toHaveBeenCalledWith({});
  });
});

describe('audit extension', () => {
  it('records mutating operations with the actor and result', async () => {
    const sink = new InMemoryAuditSink();
    const extension = createPrismaAuditExtension({
      audit: new AuditService(sink),
      models: { Person: { entityType: 'person', actions: { create: 'person.registered' } } },
      actor: () => ({ actorId: 'user-1', actorType: 'USER' }),
      before: () => ({ id: 'person-1', name: 'Old' }),
      requestId: () => 'req-1',
      metadata: () => ({ source: 'test' }),
    });

    await invoke(extension, {
      model: 'Person',
      operation: 'create',
      args: { data: { name: 'A' } },
      query: vi.fn().mockResolvedValue({ id: 'person-1', name: 'A' }),
    });

    const entries = await sink.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: 'user-1',
      actorType: 'USER',
      action: 'person.registered',
      entityType: 'person',
      entityId: 'person-1',
      before: { id: 'person-1', name: 'Old' },
      requestId: 'req-1',
      metadata: { model: 'Person', operation: 'create', source: 'test' },
    });
    expect(verifyAuditChain(entries)).toEqual({ valid: true });
  });

  it('does not audit reads', async () => {
    const record = vi.fn();
    const extension = createPrismaAuditExtension({
      audit: { record } as unknown as AuditService,
      models: { Person: true },
      actor: () => ({ actorId: 'user-1', actorType: 'USER' }),
    });

    await invoke(extension, {
      model: 'Person',
      operation: 'findMany',
      args: {},
      query: vi.fn().mockResolvedValue([]),
    });
    expect(record).not.toHaveBeenCalled();
  });
});

describe('encryption extension', () => {
  function keys() {
    return new EnvKeyProvider({ masterKey: generateMasterKey(), keyId: 'test-1' });
  }

  it('encrypts writes, sets a blind index and decrypts results', async () => {
    const provider = keys();
    const extension = createPrismaEncryptionExtension({
      keys: provider,
      models: {
        Person: [
          {
            plain: 'nic',
            stored: 'nicEncrypted',
            blindIndex: { field: 'nicBlindIndex', key: 'index-key' },
          },
        ],
      },
    });
    const query = vi.fn(async (args: Record<string, unknown>) => ({
      id: 'person-1',
      ...(args.data as Record<string, unknown>),
    }));

    const result = (await invoke(extension, {
      model: 'Person',
      operation: 'create',
      args: { data: { id: 'person-1', nic: '199012345678' } },
      query,
    })) as Record<string, unknown>;

    const written = query.mock.calls[0][0].data as Record<string, unknown>;
    expect(written.nic).toBeUndefined();
    expect(written.nicEncrypted).toEqual(expect.stringMatching(/^v1\.test-1\./));
    expect(written.nicBlindIndex).toBe(blindIndex('199012345678', 'index-key'));
    expect(result).toMatchObject({ id: 'person-1', nic: '199012345678' });
    expect(result.nicEncrypted).toBeUndefined();
  });

  it('handles nulls and rejects non-string plaintext', async () => {
    const extension = createPrismaEncryptionExtension({
      keys: keys(),
      models: { Person: [{ plain: 'bankAccount', stored: 'bankAccountEncrypted' }] },
    });

    const query = vi.fn(async (args: Record<string, unknown>) => args.data);
    await expect(
      invoke(extension, {
        model: 'Person',
        operation: 'update',
        args: { data: { bankAccount: null } },
        query,
      }),
    ).resolves.toEqual({ bankAccount: null });

    await expect(
      invoke(extension, {
        model: 'Person',
        operation: 'update',
        args: { data: { bankAccount: undefined } },
        query,
      }),
    ).resolves.toEqual({});

    await expect(
      invoke(extension, {
        model: 'Person',
        operation: 'update',
        args: { data: { bankAccount: 123 } },
        query,
      }),
    ).rejects.toThrow(/must be a string or null/);
  });

  it('decrypts nested relation results', async () => {
    const provider = keys();
    const encrypted = await provider.getActiveKey();
    expect(encrypted.keyId).toBe('test-1');

    const extension = createPrismaEncryptionExtension({
      keys: provider,
      models: { Person: [{ plain: 'nic', stored: 'nicEncrypted' }] },
    });
    const ciphertext = (await createPrismaEncryptionExtension({
      keys: provider,
      models: { Person: [{ plain: 'nic', stored: 'nicEncrypted' }] },
    }).query.$allModels.$allOperations({
      model: 'Person',
      operation: 'create',
      args: { data: { nic: '200012345678' } },
      query: vi.fn(
        async (args: Record<string, unknown>) =>
          (args.data as Record<string, unknown>).nicEncrypted,
      ),
    })) as string;

    const result = await invoke(extension, {
      model: 'Vehicle',
      operation: 'findMany',
      args: {},
      query: vi
        .fn()
        .mockResolvedValue([
          { id: 'vehicle-1', owner: { id: 'person-1', nicEncrypted: ciphertext } },
        ]),
    });

    expect(result).toEqual([{ id: 'vehicle-1', owner: { id: 'person-1', nic: '200012345678' } }]);
  });
});

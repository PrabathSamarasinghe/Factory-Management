import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  configureMalwareScanner,
  configureStorage,
  createFileStorage,
  resetMalwareScanner,
  resetStorageConfiguration,
  type EventEnvelope,
  type FileStorage,
  type MalwareScanVerdict,
} from '@galatura/platform-kit';
import { ConsentType, DocumentType } from '../generated/prisma';
import { DocumentsService } from '../src/documents/documents.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { ConsentWithdrawalDispatcher } from '../src/events/consent-withdrawal-dispatcher';

function buildPrisma(personExists: boolean) {
  const documents: any[] = [];
  const consents: any[] = [];
  const evidence: any[] = [];
  const outboxEvents: any[] = [];

  const prisma: any = {
    $transaction: async (fn: any) => fn(prisma),
    person: {
      findUnique: async (args: any) => (personExists ? { id: args.where.id, deletedAt: null } : null),
    },
    personDocument: {
      create: async (args: any) => {
        const row = { id: args.data.id, ...args.data };
        documents.push(row);
        return row;
      },
      findMany: async () => documents,
      findFirst: async (args: any) =>
        documents.find((d) => d.id === args.where.id && d.personId === args.where.personId) ?? null,
      delete: async (args: any) => {
        const index = documents.findIndex((d) => d.id === args.where.id);
        return documents.splice(index, 1)[0];
      },
    },
    consent: {
      upsert: async (args: any) => {
        const key = args.where.personId_consentType;
        const existing = consents.find(
          (c) => c.personId === key.personId && c.consentType === key.consentType,
        );
        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        }
        const created = {
          id: 'consent-1',
          createdAt: new Date(),
          ...args.create,
        };
        consents.push(created);
        return created;
      },
      findMany: async (args: any) => consents.filter((c) => c.personId === args.where.personId),
    },
    consentEvidence: {
      create: async (args: any) => {
        evidence.push(args.data);
        return args.data;
      },
      findMany: async (args: any) => evidence.filter((e) => e.personId === args.where.personId),
    },
    outboxEvent: {
      create: async (args: any) => {
        const row = {
          ...args.data,
          publishedAt: null,
          attempts: 0,
          lastError: null,
          createdAt: new Date(),
        };
        outboxEvents.push(row);
        return row;
      },
      findMany: async (args: any) =>
        outboxEvents.filter((row) =>
          args.where.publishedAt === null ? row.publishedAt === null : true,
        ),
      findUnique: async (args: any) => outboxEvents.find((row) => row.id === args.where.id) ?? null,
      update: async (args: any) => {
        const row = outboxEvents.find((candidate) => candidate.id === args.where.id);
        if (!row) {
          return null;
        }
        Object.assign(row, args.data);
        return row;
      },
    },
    __documents: documents,
    __consents: consents,
    __evidence: evidence,
    __outboxEvents: outboxEvents,
  };

  return prisma;
}

function buildStorage() {
  const deletedKeys: string[] = [];
  const storage: FileStorage = {
    putObject: async () => undefined,
    getObject: async () => Buffer.alloc(0),
    deleteObject: async (key: string) => {
      deletedKeys.push(key);
    },
    getDownloadUrl: async (key: string) => `https://signed.example/${key}`,
    getUploadUrl: async (key: string) => `https://signed.example/${key}`,
    exists: async () => true,
  };
  return { storage, deletedKeys };
}

function buildService(prisma: any, storage: FileStorage, published: EventEnvelope[] = []) {
  const outbox = new OutboxService(prisma);
  const bus = {
    publish: async (event: EventEnvelope) => {
      published.push(event);
    },
  };
  const dispatcher = new ConsentWithdrawalDispatcher(outbox, bus);
  return { service: new DocumentsService(prisma, storage, outbox, dispatcher), outbox, published };
}

function setScanner(clean: boolean, verdict: MalwareScanVerdict = clean ? 'CLEAN' : 'INFECTED') {
  configureMalwareScanner({
    scan: async () => ({
      clean,
      verdict,
      scanner: 'test-scanner',
      scannedAt: new Date().toISOString(),
    }),
  });
}

describe('DocumentsService', () => {
  const personId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    setScanner(true);
  });

  afterEach(() => {
    resetStorageConfiguration();
    resetMalwareScanner();
  });

  it('signs an upload URL through the configured Firebase provider', async () => {
    const file = {
      save: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue([Buffer.from('stored')]),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue([true]),
      getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example/object']),
    };
    configureStorage({ provider: 'firebase', firebaseBucket: { file: () => file } });
    const prisma = buildPrisma(true);
    const { service } = buildService(prisma, createFileStorage());

    const result = await service.getUploadPresignedUrl(
      personId,
      'nic-front.pdf',
      'application/pdf',
      1024,
    );

    expect(result.objectKey).toContain(`documents/${personId}/`);
    expect(result.objectKey).toContain('nic-front.pdf');
    expect(result.uploadUrl).toBe('https://signed.example/object');
    expect(result.expiresInSeconds).toBe(600);
    expect(result.mime).toBe('application/pdf');
    expect(file.getSignedUrl).toHaveBeenCalledWith({
      action: 'write',
      expires: expect.any(Date),
      contentType: 'application/pdf',
      version: 'v4',
    });
  });

  it('rejects unsafe upload keys, MIME types and sizes', async () => {
    const prisma = buildPrisma(true);
    const { service } = buildService(prisma, buildStorage().storage);

    await expect(
      service.addDocument(personId, {
        docType: DocumentType.CONTRACT,
        objectKey: '../outside.pdf',
        mime: 'application/pdf',
        sizeBytes: 1024,
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.getUploadPresignedUrl(personId, 'note.txt', 'text/plain', 10),
    ).rejects.toThrow(/MIME type/);
    await expect(
      service.getUploadPresignedUrl(personId, 'huge.pdf', 'application/pdf', 11 * 1024 * 1024),
    ).rejects.toThrow(/File size/);
  });

  it('fails closed without a clean malware scan and accepts a clean hook result', async () => {
    const prisma = buildPrisma(true);
    const { service } = buildService(prisma, buildStorage().storage);
    const input = {
      docType: DocumentType.PHOTO,
      objectKey: `documents/${personId}/photo.png`,
      mime: 'image/png',
      sizeBytes: 512,
    };

    resetMalwareScanner();
    await expect(service.addDocument(personId, input)).rejects.toThrow(ForbiddenError);
    setScanner(false);
    await expect(service.addDocument(personId, input)).rejects.toThrow(ForbiddenError);
    setScanner(true);

    const doc = await service.addDocument(personId, input, 'uploader-1');
    expect(doc.personId).toBe(personId);
    expect(doc.uploadedBy).toBe('uploader-1');
    expect(prisma.__documents).toHaveLength(1);
  });

  it('rejects document registration for an unknown person', async () => {
    const { service } = buildService(buildPrisma(false), buildStorage().storage);
    await expect(
      service.addDocument(personId, {
        docType: DocumentType.NIC_FRONT,
        objectKey: `documents/${personId}/nic.pdf`,
        mime: 'application/pdf',
        sizeBytes: 1024,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('records consent with append-only evidence and publishes a biometric withdrawal', async () => {
    const prisma = buildPrisma(true);
    const { service, published } = buildService(prisma, buildStorage().storage);

    const granted = await service.recordConsent(personId, {
      consentType: ConsentType.BIOMETRIC,
      granted: true,
      evidenceObjectKey: `documents/${personId}/consent-grant.pdf`,
    });
    expect(granted.granted).toBe(true);
    expect(granted.revokedAt).toBeNull();

    const revoked = await service.recordConsent(
      personId,
      {
        consentType: ConsentType.BIOMETRIC,
        granted: false,
        evidenceObjectKey: `documents/${personId}/consent-withdraw.pdf`,
      },
      { actorId: 'user-1' },
    );
    expect(revoked.granted).toBe(false);
    expect(revoked.revokedAt).toBeInstanceOf(Date);

    expect(prisma.__consents).toHaveLength(1);
    expect(prisma.__evidence.map((item: any) => item.objectKey)).toEqual([
      `documents/${personId}/consent-grant.pdf`,
      `documents/${personId}/consent-withdraw.pdf`,
    ]);
    expect(await service.listConsents(personId)).toMatchObject([
      {
        consentType: ConsentType.BIOMETRIC,
        evidenceObjectKeys: [
          `documents/${personId}/consent-grant.pdf`,
          `documents/${personId}/consent-withdraw.pdf`,
        ],
      },
    ]);
    expect(published).toHaveLength(1);
    expect(published[0].type).toBe('people.consent.withdrawn');
    expect(published[0]).toMatchObject({
      producer: 'people-service',
      actor: { type: 'USER', id: 'user-1' },
      payload: { personId, consentType: ConsentType.BIOMETRIC },
    });
  });

  it('rejects consent for an unknown person and deletes a stored object', async () => {
    const { service } = buildService(buildPrisma(false), buildStorage().storage);
    await expect(
      service.recordConsent(personId, { consentType: ConsentType.SMS, granted: true }),
    ).rejects.toThrow(NotFoundError);

    const prisma = buildPrisma(true);
    const { storage, deletedKeys } = buildStorage();
    const active = buildService(prisma, storage).service;
    const doc = await active.addDocument(personId, {
      docType: DocumentType.PHOTO,
      objectKey: `documents/${personId}/photo.png`,
      mime: 'image/png',
      sizeBytes: 512,
    });
    await active.deleteDocument(doc.id, personId);
    expect(deletedKeys).toEqual([`documents/${personId}/photo.png`]);
    await expect(active.deleteDocument(doc.id, personId)).rejects.toThrow(NotFoundError);
  });
});

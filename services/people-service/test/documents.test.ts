import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '@galatura/platform-kit';
import { DocumentsService } from '../src/documents/documents.service';
import { ConsentType, DocumentType } from '../generated/prisma';

function buildPrisma(personExists: boolean) {
  const documents: any[] = [];
  const consents: any[] = [];

  const prisma: any = {
    person: {
      findUnique: async (args: any) =>
        personExists ? { id: args.where.id, deletedAt: null } : null,
    },
    personDocument: {
      create: async (args: any) => {
        documents.push(args.data);
        return args.data;
      },
      findMany: async () => documents,
      findFirst: async (args: any) =>
        documents.find((d) => d.id === args.where.id && d.personId === args.where.personId) ?? null,
      delete: async (args: any) => {
        const i = documents.findIndex((d) => d.id === args.where.id);
        return documents.splice(i, 1)[0];
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
          personId: key.personId,
          consentType: key.consentType,
          ...args.create,
        };
        consents.push(created);
        return created;
      },
      findMany: async (args: any) => consents.filter((c) => c.personId === args.where.personId),
    },
    __documents: documents,
    __consents: consents,
  };

  return prisma;
}

describe('DocumentsService', () => {
  const personId = '11111111-1111-1111-1111-111111111111';

  it('issues a short-lived presigned upload target', async () => {
    const service = new DocumentsService(buildPrisma(true));
    const result = await service.getUploadPresignedUrl(
      personId,
      'nic-front.pdf',
      'application/pdf',
    );

    expect(result.objectKey).toContain(`documents/${personId}/`);
    expect(result.objectKey).toContain('nic-front.pdf');
    expect(result.uploadUrl).toContain(result.objectKey);
    expect(result.expiresInSeconds).toBe(900);
    expect(result.mime).toBe('application/pdf');
  });

  it('rejects document registration for an unknown person', async () => {
    const service = new DocumentsService(buildPrisma(false));
    await expect(
      service.addDocument(personId, {
        docType: DocumentType.NIC_FRONT,
        objectKey: 'documents/x/nic.pdf',
        mime: 'application/pdf',
        sizeBytes: 1024,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('stores a document with expiry and uploader metadata', async () => {
    const prisma = buildPrisma(true);
    const service = new DocumentsService(prisma);

    const doc = await service.addDocument(
      personId,
      {
        docType: DocumentType.CONTRACT,
        objectKey: 'documents/x/contract.pdf',
        mime: 'application/pdf',
        sizeBytes: 2048,
        expiresOn: '2027-01-01',
      },
      'uploader-1',
    );

    expect(doc.personId).toBe(personId);
    expect(doc.docType).toBe(DocumentType.CONTRACT);
    expect(doc.uploadedBy).toBe('uploader-1');
    expect(doc.expiresOn).toEqual(new Date('2027-01-01'));
    expect(prisma.__documents).toHaveLength(1);
  });

  it('records consent and can revoke it later', async () => {
    const prisma = buildPrisma(true);
    const service = new DocumentsService(prisma);

    const granted = await service.recordConsent(personId, {
      consentType: ConsentType.BIOMETRIC,
      granted: true,
    });
    expect(granted.granted).toBe(true);
    expect(granted.revokedAt).toBeUndefined();

    const revoked = await service.recordConsent(personId, {
      consentType: ConsentType.BIOMETRIC,
      granted: false,
    });
    expect(revoked.granted).toBe(false);
    expect(revoked.revokedAt).toBeInstanceOf(Date);

    const list = await service.listConsents(personId);
    expect(list).toHaveLength(1);
  });

  it('rejects consent for an unknown person and unknown document deletion', async () => {
    const service = new DocumentsService(buildPrisma(false));
    await expect(
      service.recordConsent(personId, {
        consentType: ConsentType.SMS,
        granted: true,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('deletes an existing document', async () => {
    const prisma = buildPrisma(true);
    const service = new DocumentsService(prisma);
    const doc = await service.addDocument(personId, {
      docType: DocumentType.PHOTO,
      objectKey: 'documents/x/photo.png',
      mime: 'image/png',
      sizeBytes: 512,
    });

    await service.deleteDocument(doc.id, personId);
    expect(prisma.__documents).toHaveLength(0);
    await expect(service.deleteDocument(doc.id, personId)).rejects.toThrow(NotFoundError);
  });
});

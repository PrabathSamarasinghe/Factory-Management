import { Inject, Injectable } from '@nestjs/common';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  getMalwareScanner,
  sanitizeUploadFilename,
  uuidv7,
  validateObjectKey,
  validateUploadInput,
  type FileStorage,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_STORAGE } from '../storage';
import { OutboxService } from '../outbox/outbox.service';
import { ConsentWithdrawalDispatcher } from '../events/consent-withdrawal-dispatcher';
import { createConsentWithdrawnEvent } from '../events/consent.events';
import { ConsentType, DocumentType } from '../../generated/prisma';

export interface CreateDocumentInput {
  docType: DocumentType;
  objectKey: string;
  mime: string;
  sizeBytes: number;
  expiresOn?: string;
}

export interface RecordConsentInput {
  consentType: ConsentType;
  granted: boolean;
  evidenceObjectKey?: string;
}

export interface ConsentContext {
  actorId?: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly outbox: OutboxService,
    private readonly dispatcher: ConsentWithdrawalDispatcher,
  ) {}

  async getUploadPresignedUrl(
    personId: string,
    filename: string,
    mime: string,
    sizeBytes?: number,
  ) {
    const safeFilename = sanitizeUploadFilename(filename);
    const objectKey = `documents/${personId}/${Date.now()}-${uuidv7()}-${safeFilename}`;
    const mimeType = validateUploadInput({ key: objectKey, contentType: mime, sizeBytes });
    const expiresInSeconds = 600;
    const uploadUrl = await this.storage.getUploadUrl(objectKey, {
      expiresInSeconds,
      contentType: mimeType,
      sizeBytes,
    });
    return { objectKey, uploadUrl, expiresInSeconds, mime: mimeType };
  }

  async addDocument(personId: string, input: CreateDocumentInput, uploaderId?: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId, deletedAt: null },
    });
    if (!person) {
      throw new NotFoundError(`Person ${personId} not found.`);
    }

    const objectKey = assertObjectKey(input.objectKey);
    if (!objectKey.startsWith(`documents/${personId}/`)) {
      throw new ValidationError('The object key must belong to the given person.');
    }
    const mimeType = validateUploadInput({
      key: objectKey,
      contentType: input.mime,
      sizeBytes: input.sizeBytes,
    });
    const scan = await getMalwareScanner().scan({
      objectKey,
      contentType: mimeType,
      sizeBytes: input.sizeBytes,
    });
    if (!scan.clean) {
      throw new ForbiddenError(
        `Document was not accepted because the malware scan result is ${scan.verdict}.`,
      );
    }

    return this.prisma.personDocument.create({
      data: {
        id: uuidv7(),
        personId,
        docType: input.docType,
        objectKey,
        mime: mimeType,
        sizeBytes: input.sizeBytes,
        expiresOn: input.expiresOn ? new Date(input.expiresOn) : null,
        uploadedBy: uploaderId ?? null,
      },
    });
  }

  async listDocuments(personId: string) {
    return this.prisma.personDocument.findMany({
      where: { personId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteDocument(documentId: string, personId: string) {
    const doc = await this.prisma.personDocument.findFirst({
      where: { id: documentId, personId },
    });
    if (!doc) {
      throw new NotFoundError('Document not found.');
    }
    await this.prisma.personDocument.delete({ where: { id: documentId } });
    await this.storage.deleteObject(doc.objectKey);
  }

  async recordConsent(
    personId: string,
    input: RecordConsentInput,
    context: ConsentContext = {},
  ) {
    if (!Object.values(ConsentType).includes(input.consentType)) {
      throw new ValidationError('Unknown consent type.');
    }
    const person = await this.prisma.person.findUnique({
      where: { id: personId, deletedAt: null },
    });
    if (!person) {
      throw new NotFoundError(`Person ${personId} not found.`);
    }

    const now = new Date();
    const withdrawnAt = now.toISOString();
    let withdrawalEvent: ReturnType<typeof createConsentWithdrawnEvent> | undefined;

    const consent = await this.prisma.$transaction(async (tx: any) => {
      const row = await tx.consent.upsert({
        where: {
          personId_consentType: {
            personId,
            consentType: input.consentType,
          },
        },
        update: {
          granted: input.granted,
          revokedAt: input.granted ? null : now,
        },
        create: {
          id: uuidv7(),
          personId,
          consentType: input.consentType,
          granted: input.granted,
          revokedAt: input.granted ? null : now,
        },
      });

      if (input.evidenceObjectKey) {
        await tx.consentEvidence.create({
          data: {
            id: uuidv7(),
            personId,
            consentType: input.consentType,
            objectKey: assertObjectKey(input.evidenceObjectKey),
            createdAt: now,
          },
        });
      }

      if (!input.granted && input.consentType === ConsentType.BIOMETRIC) {
        withdrawalEvent = createConsentWithdrawnEvent({
          personId,
          consentId: row.id,
          consentType: input.consentType,
          withdrawnAt,
          ...(input.evidenceObjectKey ? { evidenceObjectKey: input.evidenceObjectKey } : {}),
          actor: context.actorId
            ? { type: 'USER', id: context.actorId }
            : { type: 'SYSTEM', id: null },
        });
        await this.outbox.append(withdrawalEvent, tx);
      }

      return row;
    });

    if (withdrawalEvent) {
      await this.dispatcher.publishPending().catch(() => undefined);
    }

    return consent;
  }

  async listConsents(personId: string) {
    const consents = await this.prisma.consent.findMany({
      where: { personId },
      orderBy: { createdAt: 'desc' },
    });
    const evidence = await this.prisma.consentEvidence.findMany({
      where: { personId },
      orderBy: { createdAt: 'asc' },
    });
    return consents.map((consent: any) => ({
      ...consent,
      evidenceObjectKeys: evidence
        .filter((item: any) => item.consentType === consent.consentType)
        .map((item: any) => item.objectKey),
    }));
  }
}

function assertObjectKey(key: string): string {
  try {
    return validateObjectKey(key);
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : 'Invalid object key.');
  }
}

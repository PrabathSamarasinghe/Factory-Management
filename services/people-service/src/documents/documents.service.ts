import { Injectable } from '@nestjs/common';
import { NotFoundError, uuidv7 } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
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

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a pre-signed upload URL object for the client.
   */
  async getUploadPresignedUrl(personId: string, filename: string, mime: string) {
    const objectKey = `documents/${personId}/${Date.now()}-${filename}`;
    // Mock / dev signed URL format (or Firebase storage URL)
    const uploadUrl = `https://storage.googleapis.com/galatura-documents/${objectKey}?uploadToken=${uuidv7()}`;
    return {
      objectKey,
      uploadUrl,
      expiresInSeconds: 900,
      mime,
    };
  }

  async addDocument(
    personId: string,
    input: CreateDocumentInput,
    uploaderId?: string,
  ) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId, deletedAt: null },
    });
    if (!person) throw new NotFoundError(`Person ${personId} not found.`);

    return this.prisma.personDocument.create({
      data: {
        id: uuidv7(),
        personId,
        docType: input.docType,
        objectKey: input.objectKey,
        mime: input.mime,
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
    if (!doc) throw new NotFoundError('Document not found.');
    await this.prisma.personDocument.delete({ where: { id: documentId } });
  }

  async recordConsent(personId: string, input: RecordConsentInput) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId, deletedAt: null },
    });
    if (!person) throw new NotFoundError(`Person ${personId} not found.`);

    return this.prisma.consent.upsert({
      where: {
        personId_consentType: {
          personId,
          consentType: input.consentType,
        },
      },
      update: {
        granted: input.granted,
        revokedAt: input.granted ? null : new Date(),
        evidenceObjectKey: input.evidenceObjectKey,
      },
      create: {
        id: uuidv7(),
        personId,
        consentType: input.consentType,
        granted: input.granted,
        evidenceObjectKey: input.evidenceObjectKey,
      },
    });
  }

  async listConsents(personId: string) {
    return this.prisma.consent.findMany({
      where: { personId },
    });
  }
}

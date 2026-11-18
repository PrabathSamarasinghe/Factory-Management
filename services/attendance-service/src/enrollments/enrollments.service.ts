import { Inject, Injectable } from '@nestjs/common';
import {
  ForbiddenError,
  isUuid,
  uuidv7,
  ValidationError,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { AttendanceAuditService } from '../audit/audit.service';
import { PeopleConsentClient } from '../people/people-consent.client';
import {
  FACE_ENGINE,
  type FaceAnalysis,
  type FaceEngine,
  type FaceFrame,
} from '../face/face-engine';

export interface EnrolFaceInput {
  personId: string;
  frames: FaceFrame[];
}

export interface EnrolmentContext {
  actorId?: string;
  ip?: string;
}

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AttendanceAuditService,
    private readonly consent: PeopleConsentClient,
    @Inject(FACE_ENGINE) private readonly faceEngine: FaceEngine,
  ) {}

  async enrol(input: EnrolFaceInput, context: EnrolmentContext = {}) {
    if (!isUuid(input.personId)) {
      throw new ValidationError('personId must be a UUID.');
    }
    if (!Array.isArray(input.frames) || input.frames.length < 3 || input.frames.length > 5) {
      throw new ValidationError('Enrolment requires between 3 and 5 face frames.');
    }
    for (const frame of input.frames) {
      if (!frame?.imageBase64 || frame.imageBase64.length > 8 * 1024 * 1024) {
        throw new ValidationError('Each face frame must be up to 8 MB of base64 data.');
      }
    }

    const consent = await this.consent.assertBiometricConsent(input.personId);
    const analyses: FaceAnalysis[] = [];
    for (const frame of input.frames) {
      analyses.push(await this.faceEngine.analyze(frame));
    }

    if (analyses.some((analysis) => !analysis.livenessPassed)) {
      throw new ForbiddenError('All enrolment frames must pass the liveness check.');
    }

    const averageQuality =
      analyses.reduce((sum, analysis) => sum + analysis.qualityScore, 0) / analyses.length;
    if (averageQuality < 0.5) {
      throw new ValidationError('The enrolment frames are too low quality. Retake them.');
    }

    const encrypted = await Promise.all(
      analyses.map((analysis) =>
        this.encryption.encrypt(
          JSON.stringify(analysis.embedding.map((value) => Number(value.toFixed(8)))),
        ),
      ),
    );

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx: any) => {
      await tx.faceTemplate.updateMany({
        where: { personId: input.personId, isActive: true },
        data: {
          isActive: false,
          templateEnc: '',
          revokedAt: now,
          revokeReason: 'REPLACED',
        },
      });

      for (let index = 0; index < analyses.length; index += 1) {
        await tx.faceTemplate.create({
          data: {
            id: uuidv7(),
            personId: input.personId,
            templateEnc: encrypted[index],
            encKeyId: this.encryption.activeKeyId,
            modelName: this.faceEngine.modelName,
            modelVersion: this.faceEngine.modelVersion,
            embeddingDim: this.faceEngine.embeddingDim,
            qualityScore: analyses[index].qualityScore,
            isActive: true,
            enrolledBy: context.actorId,
            enrolledAt: now,
          },
        });
      }

      return tx.faceTemplate.findMany({
        where: { personId: input.personId, isActive: true },
        orderBy: { enrolledAt: 'asc' },
      });
    });

    await this.audit.record({
      actorId: context.actorId,
      action: 'face.templates.enrolled',
      entityType: 'person',
      entityId: input.personId,
      metadata: {
        templateCount: result.length,
        modelName: this.faceEngine.modelName,
        modelVersion: this.faceEngine.modelVersion,
        consentGrantedAt: consent.grantedAt,
      },
      ip: context.ip,
    });

    return {
      personId: input.personId,
      enrolled: true,
      templateCount: result.length,
      modelName: this.faceEngine.modelName,
      modelVersion: this.faceEngine.modelVersion,
      enrolledAt: result[0]?.enrolledAt ?? now,
    };
  }

  async revoke(personId: string, reason: string | undefined, context: EnrolmentContext = {}) {
    if (!isUuid(personId)) {
      throw new ValidationError('personId must be a UUID.');
    }
    const now = new Date();
    const result = await this.prisma.faceTemplate.updateMany({
      where: { personId, isActive: true },
      data: {
        isActive: false,
        templateEnc: '',
        revokedAt: now,
        revokeReason: reason?.trim() || 'REVOKED_BY_ADMIN',
      },
    });

    await this.audit.record({
      actorId: context.actorId,
      action: 'face.templates.revoked',
      entityType: 'person',
      entityId: personId,
      metadata: {
        revokedTemplates: result.count,
        reason: reason?.trim() || 'REVOKED_BY_ADMIN',
      },
      ip: context.ip,
    });

    return { personId, revoked: true, templateCount: result.count, revokedAt: now };
  }

  async status(personId: string) {
    if (!isUuid(personId)) {
      throw new ValidationError('personId must be a UUID.');
    }
    const templates = await this.prisma.faceTemplate.findMany({
      where: { personId, isActive: true },
      select: {
        id: true,
        modelName: true,
        modelVersion: true,
        enrolledAt: true,
        revokedAt: true,
      },
    });

    return {
      personId,
      enrolled: templates.length > 0,
      templateCount: templates.length,
      modelName: templates[0]?.modelName ?? null,
      modelVersion: templates[0]?.modelVersion ?? null,
      lastEnrolledAt: templates[templates.length - 1]?.enrolledAt ?? null,
      consentRequired: true,
    };
  }
}

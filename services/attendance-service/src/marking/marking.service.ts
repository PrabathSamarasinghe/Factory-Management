import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictError,
  ForbiddenError,
  isUuid,
  NotFoundError,
  ValidationError,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { AttendanceAuditService } from '../audit/audit.service';
import { FACE_ENGINE, type FaceEngine, type FaceFrame } from '../face/face-engine';
import { DailyAttendanceService } from '../days/daily-attendance.service';
import { workDateFor } from '../common/date';
import { VerificationRateLimiter } from './verification-rate-limiter';

export interface MarkInput {
  clientEventId: string;
  personId?: string;
  deviceId?: string;
  locationId?: string;
  eventType?: 'CHECK_IN' | 'CHECK_OUT';
  imageBase64: string;
  capturedAt?: string;
  gpsLat?: number;
  gpsLng?: number;
}

export interface ManualMarkInput {
  clientEventId: string;
  personId: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT';
  eventAt?: string;
  deviceId?: string;
  locationId?: string;
  reason: string;
  gpsLat?: number;
  gpsLng?: number;
}

interface MarkingContext {
  actorId?: string;
  ip?: string;
}

@Injectable()
export class MarkingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AttendanceAuditService,
    private readonly daily: DailyAttendanceService,
    private readonly rateLimiter: VerificationRateLimiter,
    @Inject(FACE_ENGINE) private readonly faceEngine: FaceEngine,
  ) {}

  async mark(input: MarkInput, context: MarkingContext = {}) {
    validateClientEventId(input.clientEventId);
    validateOptionalUuid(input.personId, 'personId');
    validateOptionalUuid(input.deviceId, 'deviceId');
    validateOptionalUuid(input.locationId, 'locationId');
    validateCoordinates(input.gpsLat, input.gpsLng);
    if (!input.imageBase64 || input.imageBase64.length > 8 * 1024 * 1024) {
      throw new ValidationError('A face frame up to 8 MB is required.');
    }

    const existing = await this.prisma.attendanceEvent.findUnique({
      where: { clientEventId: input.clientEventId },
    });
    if (existing) {
      const workDate = workDateFor(existing.eventAt);
      const day = await this.prisma.attendanceDay.findUnique({
        where: { personId_workDate: { personId: existing.personId, workDate } },
      });
      return { duplicate: true, event: existing, day, personId: existing.personId };
    }

    this.rateLimiter.check(input.deviceId);

    const frame: FaceFrame = { imageBase64: input.imageBase64, capturedAt: input.capturedAt };
    const analysis = await this.faceEngine.analyze(frame);
    const capturedAt = validatedCapturedAt(input.capturedAt);

    if (!analysis.livenessPassed) {
      const attempt = await this.recordAttempt({
        input,
        analysis,
        matched: false,
        personId: input.personId ?? null,
        similarity: null,
        failureReason: 'LIVENESS_FAILED',
        capturedAt,
      });
      await this.audit.record({
        actorId: input.deviceId ?? context.actorId,
        actorType: 'DEVICE',
        action: 'face.verification.failed',
        entityType: 'face_verification_attempt',
        entityId: attempt.id,
        metadata: { reason: 'LIVENESS_FAILED' },
        ip: context.ip,
      });
      throw new ForbiddenError('Liveness verification failed.', {
        details: { attemptId: attempt.id },
      });
    }

    const templates = await this.prisma.faceTemplate.findMany({
      where: {
        ...(input.personId ? { personId: input.personId } : {}),
        isActive: true,
      },
      take: input.personId ? 10 : 5000,
    });

    if (templates.length === 0) {
      const attempt = await this.recordAttempt({
        input,
        analysis,
        matched: false,
        personId: input.personId ?? null,
        similarity: null,
        failureReason: 'NO_ACTIVE_TEMPLATE',
        capturedAt,
      });
      throw new ForbiddenError('No active face enrolment was found.', {
        details: { attemptId: attempt.id },
      });
    }

    let bestPersonId: string | null = null;
    let bestSimilarity = -1;
    for (const template of templates as any[]) {
      const embedding = await this.decryptTemplate(template);
      const similarity = this.faceEngine.compare(analysis.embedding, embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestPersonId = template.personId;
      }
    }

    const matched = bestSimilarity >= this.faceEngine.threshold;
    const attempt = await this.recordAttempt({
      input,
      analysis,
      matched,
      personId: bestPersonId,
      similarity: bestSimilarity,
      failureReason: matched ? null : 'BELOW_THRESHOLD',
      capturedAt,
    });

    if (!matched || !bestPersonId) {
      await this.audit.record({
        actorId: input.deviceId ?? context.actorId,
        actorType: 'DEVICE',
        action: 'face.verification.failed',
        entityType: 'face_verification_attempt',
        entityId: attempt.id,
        metadata: { reason: 'BELOW_THRESHOLD' },
        ip: context.ip,
      });
      throw new ForbiddenError('Face verification failed.', {
        details: { attemptId: attempt.id },
      });
    }

    this.rateLimiter.check(undefined, bestPersonId);

    const workDate = workDateFor(capturedAt);
    const eventType = input.eventType ?? (await this.nextEventType(bestPersonId, workDate));
    const event = await this.prisma.attendanceEvent.create({
      data: {
        personId: bestPersonId,
        eventType,
        eventAt: capturedAt,
        workDate,
        method: 'FACE',
        verificationAttemptId: attempt.id,
        deviceId: input.deviceId,
        locationId: input.locationId,
        gpsLat: input.gpsLat,
        gpsLng: input.gpsLng,
        clientEventId: input.clientEventId,
      },
    });

    const dayResult = await this.daily.recalculateDay(bestPersonId, workDate);

    await this.audit.record({
      actorId: input.deviceId ?? context.actorId,
      actorType: 'DEVICE',
      action: 'attendance.marked',
      entityType: 'attendance_event',
      entityId: event.id,
      metadata: { personId: bestPersonId, eventType, similarity: bestSimilarity },
      ip: context.ip,
    });

    return {
      duplicate: false,
      matched: true,
      personId: bestPersonId,
      attemptId: attempt.id,
      event,
      day: dayResult?.day ?? null,
    };
  }

  async markManual(input: ManualMarkInput, context: MarkingContext = {}) {
    validateClientEventId(input.clientEventId);
    if (!isUuid(input.personId)) {
      throw new ValidationError('personId must be a UUID.');
    }
    validateOptionalUuid(input.deviceId, 'deviceId');
    validateOptionalUuid(input.locationId, 'locationId');
    if (!input.reason || input.reason.trim().length < 5) {
      throw new ValidationError('A manual entry reason of at least 5 characters is required.');
    }
    if (!context.actorId) {
      throw new ForbiddenError('A supervisor identity is required for manual attendance.');
    }
    validateCoordinates(input.gpsLat, input.gpsLng);

    const existing = await this.prisma.attendanceEvent.findUnique({
      where: { clientEventId: input.clientEventId },
    });
    if (existing) {
      const day = await this.prisma.attendanceDay.findUnique({
        where: { personId_workDate: { personId: existing.personId, workDate: existing.workDate } },
      });
      return { duplicate: true, event: existing, day };
    }

    const eventAt = validatedCapturedAt(input.eventAt);
    const workDate = workDateFor(eventAt);
    const event = await this.prisma.attendanceEvent.create({
      data: {
        personId: input.personId,
        eventType: input.eventType,
        eventAt,
        workDate,
        method: 'MANUAL',
        deviceId: input.deviceId,
        locationId: input.locationId,
        gpsLat: input.gpsLat,
        gpsLng: input.gpsLng,
        manualReason: input.reason.trim(),
        enteredBy: context.actorId,
        clientEventId: input.clientEventId,
      },
    });

    const dayResult = await this.daily.recalculateDay(input.personId, workDate);
    await this.audit.record({
      actorId: context.actorId,
      action: 'attendance.manual_marked',
      entityType: 'attendance_event',
      entityId: event.id,
      metadata: { personId: input.personId, eventType: input.eventType },
      ip: context.ip,
    });

    return { duplicate: false, event, day: dayResult?.day ?? null };
  }

  async listEvents(query: { personId?: string; from?: string; to?: string }) {
    const where: any = {};
    if (query.personId) {
      where.personId = query.personId;
    }
    if (query.from || query.to) {
      where.eventAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.from && Number.isNaN(new Date(query.from).getTime())) {
      throw new ValidationError('Invalid from timestamp.');
    }
    if (query.to && Number.isNaN(new Date(query.to).getTime())) {
      throw new ValidationError('Invalid to timestamp.');
    }
    return this.prisma.attendanceEvent.findMany({
      where,
      orderBy: { eventAt: 'desc' },
      take: 1000,
    });
  }

  private async decryptTemplate(template: any): Promise<number[]> {
    const plaintext = await this.encryption.decrypt(template.templateEnc);
    const parsed = JSON.parse(plaintext) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== this.faceEngine.embeddingDim ||
      !parsed.every((value) => typeof value === 'number')
    ) {
      throw new ConflictError('The stored face template is invalid.');
    }
    return parsed;
  }

  private async nextEventType(
    personId: string,
    workDate: Date,
  ): Promise<'CHECK_IN' | 'CHECK_OUT'> {
    const last = await this.prisma.attendanceEvent.findFirst({
      where: { personId, workDate },
      orderBy: { eventAt: 'desc' },
    });
    return last?.eventType === 'CHECK_IN' ? 'CHECK_OUT' : 'CHECK_IN';
  }

  private async recordAttempt(input: {
    input: MarkInput;
    analysis: Awaited<ReturnType<FaceEngine['analyze']>>;
    matched: boolean;
    personId: string | null;
    similarity: number | null;
    failureReason: string | null;
    capturedAt: Date;
  }) {
    return this.prisma.faceVerificationAttempt.create({
      data: {
        deviceId: input.input.deviceId,
        personId: input.personId,
        matched: input.matched,
        similarity: input.similarity,
        threshold: this.faceEngine.threshold,
        livenessScore: input.analysis.livenessScore,
        livenessPassed: input.analysis.livenessPassed,
        modelVersion: this.faceEngine.modelVersion,
        failureReason: input.failureReason,
        capturedAt: input.capturedAt,
        frameObjectKey: null,
      },
    });
  }
}

function validateClientEventId(value: string): void {
  if (!isUuid(value)) {
    throw new ValidationError('clientEventId must be a UUID.');
  }
}

function validateOptionalUuid(value: string | undefined, field: string): void {
  if (value !== undefined && !isUuid(value)) {
    throw new ValidationError(`${field} must be a UUID.`);
  }
}

function validateCoordinates(lat?: number, lng?: number): void {
  if (lat !== undefined && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
    throw new ValidationError('gpsLat must be between -90 and 90.');
  }
  if (lng !== undefined && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
    throw new ValidationError('gpsLng must be between -180 and 180.');
  }
}

function validatedCapturedAt(value?: string): Date {
  const capturedAt = value ? new Date(value) : new Date();
  if (Number.isNaN(capturedAt.getTime())) {
    throw new ValidationError('capturedAt must be an ISO timestamp.');
  }
  const now = Date.now();
  if (capturedAt.getTime() > now + 2 * 60_000) {
    throw new ValidationError('capturedAt must not be in the future.');
  }
  if (capturedAt.getTime() < now - 8 * 24 * 60 * 60_000) {
    throw new ValidationError('capturedAt is outside the allowed offline window.');
  }
  return capturedAt;
}

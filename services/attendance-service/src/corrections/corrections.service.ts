import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  ForbiddenError,
  isUuid,
  NotFoundError,
  uuidv7,
  ValidationError,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { DailyAttendanceService } from '../days/daily-attendance.service';
import { AttendanceAuditService } from '../audit/audit.service';
import { dateOnly } from '../common/date';

export interface CreateCorrectionInput {
  personId: string;
  workDate: string;
  proposedIn?: string;
  proposedOut?: string;
  reason: string;
}

@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly daily: DailyAttendanceService,
    private readonly audit: AttendanceAuditService,
  ) {}

  async create(input: CreateCorrectionInput, context: { actorId?: string; ip?: string }) {
    if (!isUuid(input.personId)) {
      throw new ValidationError('personId must be a UUID.');
    }
    if (!context.actorId) {
      throw new ForbiddenError('A requesting user is required.');
    }
    if (!input.reason || input.reason.trim().length < 5) {
      throw new ValidationError('A correction reason of at least 5 characters is required.');
    }

    const workDate = dateOnly(input.workDate);
    const proposedIn = input.proposedIn ? parseTime(input.proposedIn, 'proposedIn') : null;
    const proposedOut = input.proposedOut ? parseTime(input.proposedOut, 'proposedOut') : null;
    if (!proposedIn && !proposedOut) {
      throw new ValidationError('At least one of proposedIn or proposedOut is required.');
    }
    if (proposedIn && proposedOut && proposedOut.getTime() <= proposedIn.getTime()) {
      throw new ValidationError('proposedOut must be after proposedIn.');
    }

    const correction = await this.prisma.attendanceCorrection.create({
      data: {
        id: uuidv7(),
        personId: input.personId,
        workDate,
        requestedBy: context.actorId,
        proposedIn,
        proposedOut,
        reason: input.reason.trim(),
        status: 'PENDING',
      },
    });

    await this.audit.record({
      actorId: context.actorId,
      action: 'attendance.correction.requested',
      entityType: 'attendance_correction',
      entityId: correction.id,
      metadata: { personId: input.personId, workDate: workDate.toISOString().slice(0, 10) },
      ip: context.ip,
    });

    return correction;
  }

  async list(query: { personId?: string; status?: string; from?: string; to?: string }) {
    const where: any = {};
    if (query.personId) where.personId = query.personId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.workDate = {
        ...(query.from ? { gte: dateOnly(query.from) } : {}),
        ...(query.to ? { lte: dateOnly(query.to) } : {}),
      };
    }
    return this.prisma.attendanceCorrection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async approve(id: string, context: { actorId?: string; ip?: string }) {
    if (!context.actorId) {
      throw new ForbiddenError('An approving user is required.');
    }
    const correction = await this.requirePending(id);
    const now = new Date();
    const updated = await this.prisma.attendanceCorrection.update({
      where: { id },
      data: { status: 'APPROVED', decidedBy: context.actorId, decidedAt: now },
    });

    const day = await this.daily.recalculateDay(
      correction.personId,
      dateOnly(correction.workDate),
    );
    await this.audit.record({
      actorId: context.actorId,
      action: 'attendance.correction.approved',
      entityType: 'attendance_correction',
      entityId: id,
      metadata: { personId: correction.personId },
      ip: context.ip,
    });

    return { correction: updated, day: day?.day ?? null };
  }

  async reject(id: string, context: { actorId?: string; ip?: string }) {
    if (!context.actorId) {
      throw new ForbiddenError('A deciding user is required.');
    }
    await this.requirePending(id);
    const updated = await this.prisma.attendanceCorrection.update({
      where: { id },
      data: { status: 'REJECTED', decidedBy: context.actorId, decidedAt: new Date() },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'attendance.correction.rejected',
      entityType: 'attendance_correction',
      entityId: id,
      ip: context.ip,
    });
    return updated;
  }

  private async requirePending(id: string) {
    const correction = await this.prisma.attendanceCorrection.findUnique({ where: { id } });
    if (!correction) {
      throw new NotFoundError(`Correction "${id}" was not found.`);
    }
    if (correction.status !== 'PENDING') {
      throw new ConflictError(`Correction "${id}" has already been decided.`);
    }
    return correction;
  }
}

function parseTime(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${field} must be an ISO timestamp.`);
  }
  return date;
}

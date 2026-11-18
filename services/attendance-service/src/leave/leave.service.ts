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
import { dateOnly, eachDate, inclusiveDays } from '../common/date';

export interface CreateLeaveTypeInput {
  code: string;
  name: string;
  paid?: boolean;
  annualQuota?: number;
}

export interface CreateLeaveRequestInput {
  personId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  reason?: string;
}

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly daily: DailyAttendanceService,
    private readonly audit: AttendanceAuditService,
  ) {}

  async listLeaveTypes() {
    return this.prisma.leaveType.findMany({ orderBy: { code: 'asc' } });
  }

  async createLeaveType(input: CreateLeaveTypeInput) {
    if (!input.code || !/^[A-Z0-9_-]{2,20}$/.test(input.code)) {
      throw new ValidationError('Leave type code must be 2-20 uppercase characters.');
    }
    if (!input.name) {
      throw new ValidationError('Leave type name is required.');
    }
    const existing = await this.prisma.leaveType.findUnique({ where: { code: input.code } });
    if (existing) {
      throw new ConflictError(`Leave type "${input.code}" already exists.`);
    }
    return this.prisma.leaveType.create({
      data: {
        id: uuidv7(),
        code: input.code,
        name: input.name.trim(),
        paid: input.paid ?? true,
        annualQuota: input.annualQuota,
      },
    });
  }

  async listLeaveRequests(query: { personId?: string; status?: string }) {
    const where: any = {};
    if (query.personId) where.personId = query.personId;
    if (query.status) where.status = query.status;
    return this.prisma.leaveRequest.findMany({
      where,
      orderBy: [{ fromDate: 'desc' }],
      take: 500,
    });
  }

  async createLeaveRequest(
    input: CreateLeaveRequestInput,
    context: { actorId?: string; ip?: string },
  ) {
    if (!isUuid(input.personId)) {
      throw new ValidationError('personId must be a UUID.');
    }
    if (!isUuid(input.leaveTypeId)) {
      throw new ValidationError('leaveTypeId must be a UUID.');
    }
    const leaveType = await this.prisma.leaveType.findUnique({
      where: { id: input.leaveTypeId },
    });
    if (!leaveType) {
      throw new NotFoundError(`Leave type "${input.leaveTypeId}" was not found.`);
    }

    const fromDate = dateOnly(input.fromDate);
    const toDate = dateOnly(input.toDate);
    const days = inclusiveDays(fromDate, toDate);
    const overlapping = await this.prisma.leaveRequest.findFirst({
      where: {
        personId: input.personId,
        status: { in: ['PENDING', 'APPROVED'] },
        fromDate: { lte: toDate },
        toDate: { gte: fromDate },
      },
    });
    if (overlapping) {
      throw new ConflictError('The person already has leave in that period.');
    }

    const request = await this.prisma.leaveRequest.create({
      data: {
        id: uuidv7(),
        personId: input.personId,
        leaveTypeId: input.leaveTypeId,
        fromDate,
        toDate,
        days,
        reason: input.reason?.trim(),
        status: 'PENDING',
      },
    });

    await this.audit.record({
      actorId: context.actorId,
      action: 'attendance.leave.requested',
      entityType: 'leave_request',
      entityId: request.id,
      metadata: { personId: input.personId, days },
      ip: context.ip,
    });
    return request;
  }

  async decideLeaveRequest(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    context: { actorId?: string; ip?: string },
  ) {
    if (!context.actorId) {
      throw new ForbiddenError('A deciding user is required.');
    }
    const request = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundError(`Leave request "${id}" was not found.`);
    }
    if (request.status !== 'PENDING') {
      throw new ConflictError(`Leave request "${id}" has already been decided.`);
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: decision, decidedBy: context.actorId, decidedAt: new Date() },
    });

    if (decision === 'APPROVED') {
      for (const date of eachDate(request.fromDate, request.toDate)) {
        await this.daily.recalculateDay(request.personId, date);
      }
    }

    await this.audit.record({
      actorId: context.actorId,
      action: `attendance.leave.${decision.toLowerCase()}`,
      entityType: 'leave_request',
      entityId: id,
      metadata: { personId: request.personId },
      ip: context.ip,
    });

    return updated;
  }

  async listHolidays() {
    return this.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  }

  async createHoliday(input: { date: string; name: string }) {
    if (!input.name) {
      throw new ValidationError('Holiday name is required.');
    }
    const date = dateOnly(input.date);
    const existing = await this.prisma.holiday.findUnique({ where: { date } });
    if (existing) {
      throw new ConflictError(`A holiday already exists on ${date.toISOString().slice(0, 10)}.`);
    }
    return this.prisma.holiday.create({
      data: { id: uuidv7(), date, name: input.name.trim() },
    });
  }
}

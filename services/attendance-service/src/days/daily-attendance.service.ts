import { Injectable } from '@nestjs/common';
import { createEvent, uuidv7, ValidationError, type EventEnvelope } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  addDays,
  dateOnly,
  formatDateOnly,
  localTimeToUtc,
  minutesBetween,
  timezoneOffsetMinutes,
} from '../common/date';

export interface RecalculateDayOptions {
  close?: boolean;
  now?: Date;
}

export interface RecalculateDayResult {
  day: any;
  event: EventEnvelope | null;
  alreadyClosed: boolean;
}

export interface DayListQuery {
  personId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class DailyAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async recalculateDay(
    personId: string,
    workDateInput: string | Date,
    options: RecalculateDayOptions = {},
  ): Promise<RecalculateDayResult | null> {
    const workDate = dateOnly(workDateInput);
    const now = options.now ?? new Date();
    const offset = timezoneOffsetMinutes();

    const [events, holiday, leave, correction, shift] = await Promise.all([
      this.prisma.attendanceEvent.findMany({
        where: { personId, workDate },
        orderBy: { eventAt: 'asc' },
      }),
      this.prisma.holiday.findUnique({ where: { date: workDate } }),
      this.prisma.leaveRequest.findFirst({
        where: {
          personId,
          status: 'APPROVED',
          fromDate: { lte: workDate },
          toDate: { gte: workDate },
        },
      }),
      this.prisma.attendanceCorrection.findFirst({
        where: { personId, workDate, status: 'APPROVED' },
        orderBy: { decidedAt: 'desc' },
      }),
      this.findShiftForDate(personId, workDate),
    ]);

    let firstIn: Date | null =
      events.find((event: any) => event.eventType === 'CHECK_IN')?.eventAt ?? null;
    let lastOut: Date | null =
      [...events].reverse().find((event: any) => event.eventType === 'CHECK_OUT')?.eventAt ?? null;

    if (correction?.proposedIn) {
      firstIn = correction.proposedIn;
    }
    if (correction?.proposedOut) {
      lastOut = correction.proposedOut;
    }

    let rawWorkedMinutes = pairedMinutes(events);
    if (correction?.proposedIn && correction?.proposedOut) {
      rawWorkedMinutes = minutesBetween(correction.proposedIn, correction.proposedOut);
    } else if (rawWorkedMinutes === 0 && firstIn && lastOut) {
      rawWorkedMinutes = minutesBetween(firstIn, lastOut);
    }

    const expectedMinutes = this.expectedMinutes(shift, workDate, offset);
    const workedMinutes = Math.max(
      0,
      rawWorkedMinutes - (shift?.breakMinutes ?? 0),
    );

    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
    let overtimeMinutes = 0;

    if (shift) {
      const start = localTimeToUtc(workDate, shift.startTime, offset);
      const endDate = shift.crossesMidnight ? addDays(workDate, 1) : workDate;
      const end = localTimeToUtc(endDate, shift.endTime, offset);
      const graceEnd = new Date(start.getTime() + shift.graceMinutes * 60_000);

      if (firstIn && firstIn.getTime() > graceEnd.getTime()) {
        lateMinutes = minutesBetween(graceEnd, firstIn);
      }
      if (lastOut && lastOut.getTime() < end.getTime()) {
        earlyLeaveMinutes = minutesBetween(lastOut, end);
      }
      overtimeMinutes = Math.max(0, workedMinutes - expectedMinutes);
    }

    const hasPunch = events.length > 0;
    const hasCorrection = Boolean(correction?.proposedIn || correction?.proposedOut);

    let status: string;
    if (!hasPunch && !hasCorrection) {
      if (leave) {
        status = 'LEAVE';
      } else if (holiday) {
        status = 'HOLIDAY';
      } else if (options.close) {
        status = 'ABSENT';
      } else {
        return null;
      }
    } else if (!firstIn || !lastOut) {
      status = 'INCOMPLETE';
    } else if (shift && expectedMinutes > 0 && workedMinutes < Math.floor(expectedMinutes / 2)) {
      status = 'HALF_DAY';
    } else {
      status = 'PRESENT';
    }

    const existing = await this.prisma.attendanceDay.findUnique({
      where: { personId_workDate: { personId, workDate } },
    });

    if (options.close && existing?.closedAt) {
      return { day: existing, event: null, alreadyClosed: true };
    }

    const data = {
      firstIn,
      lastOut,
      workedMinutes,
      lateMinutes,
      earlyLeaveMinutes,
      overtimeMinutes,
      status,
      shiftId: shift?.id ?? null,
      ...(options.close ? { closedAt: now } : {}),
    } as any;

    const day = existing
      ? await this.prisma.attendanceDay.update({ where: { id: existing.id }, data })
      : await this.prisma.attendanceDay.create({
          data: {
            id: uuidv7(),
            personId,
            workDate,
            approved: false,
            ...data,
          },
        });

    let event: EventEnvelope | null = null;
    if (options.close) {
      event = createEvent({
        type: 'attendance.day.closed',
        version: 1,
        producer: 'attendance-service',
        occurredAt: now,
        actor: { type: 'SYSTEM' },
        payload: {
          personId,
          workDate: formatDateOnly(workDate),
          status,
          firstIn: firstIn ? firstIn.toISOString() : null,
          lastOut: lastOut ? lastOut.toISOString() : null,
          workedMinutes,
          lateMinutes,
          earlyLeaveMinutes,
          overtimeMinutes,
          shiftId: shift?.id ?? null,
          approved: day.approved ?? false,
        },
      });
      await this.outbox.append(event);
    }

    return { day, event, alreadyClosed: false };
  }

  async closeDate(dateInput: string, now = new Date()) {
    const workDate = dateOnly(dateInput);
    const [eventPeople, assignmentPeople, leavePeople, correctionPeople] = await Promise.all([
      this.prisma.attendanceEvent.findMany({
        where: { workDate },
        select: { personId: true },
        distinct: ['personId'],
      }),
      this.prisma.shiftAssignment.findMany({
        where: {
          effectiveFrom: { lte: workDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
        },
        select: { personId: true },
        distinct: ['personId'],
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          status: 'APPROVED',
          fromDate: { lte: workDate },
          toDate: { gte: workDate },
        },
        select: { personId: true },
        distinct: ['personId'],
      }),
      this.prisma.attendanceCorrection.findMany({
        where: { workDate },
        select: { personId: true },
        distinct: ['personId'],
      }),
    ]);

    const personIds = new Set<string>(
      [...eventPeople, ...assignmentPeople, ...leavePeople, ...correctionPeople].map(
        (row: any) => row.personId,
      ),
    );

    let closed = 0;
    let skipped = 0;
    const events: EventEnvelope[] = [];
    for (const personId of personIds) {
      const result = await this.recalculateDay(personId, workDate, { close: true, now });
      if (!result) {
        skipped += 1;
        continue;
      }
      if (result.alreadyClosed) {
        skipped += 1;
        continue;
      }
      closed += 1;
      if (result.event) {
        events.push(result.event);
      }
    }

    return {
      workDate: formatDateOnly(workDate),
      people: personIds.size,
      closed,
      skipped,
      eventIds: events.map((event) => event.id),
    };
  }

  async listDays(query: DayListQuery) {
    const where: any = {};
    if (query.personId) {
      where.personId = query.personId;
    }
    if (query.from || query.to) {
      where.workDate = {
        ...(query.from ? { gte: dateOnly(query.from) } : {}),
        ...(query.to ? { lte: dateOnly(query.to) } : {}),
      };
    }

    return this.prisma.attendanceDay.findMany({
      where,
      orderBy: [{ workDate: 'desc' }, { personId: 'asc' }],
      take: 1000,
    });
  }

  async summary(dateInput: string) {
    const workDate = dateOnly(dateInput);
    const days = await this.prisma.attendanceDay.findMany({
      where: { workDate },
      select: { status: true },
    });

    const byStatus: Record<string, number> = {};
    for (const day of days as any[]) {
      byStatus[day.status] = (byStatus[day.status] ?? 0) + 1;
    }

    return {
      date: formatDateOnly(workDate),
      total: days.length,
      present: byStatus.PRESENT ?? 0,
      absent: byStatus.ABSENT ?? 0,
      leave: byStatus.LEAVE ?? 0,
      incomplete: byStatus.INCOMPLETE ?? 0,
      byStatus,
    };
  }

  async monthlyReport(month: string, personId?: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) {
      throw new ValidationError('month must use YYYY-MM format.');
    }
    const year = Number(match[1]);
    const monthNumber = Number(match[2]);
    if (monthNumber < 1 || monthNumber > 12) {
      throw new ValidationError('month must use YYYY-MM format.');
    }

    const from = new Date(Date.UTC(year, monthNumber - 1, 1));
    const to = new Date(Date.UTC(year, monthNumber, 0));
    const days = await this.prisma.attendanceDay.findMany({
      where: {
        workDate: { gte: from, lte: to },
        ...(personId ? { personId } : {}),
      },
      orderBy: [{ personId: 'asc' }, { workDate: 'asc' }],
    });

    const totals = {
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      presentDays: 0,
      absentDays: 0,
      leaveDays: 0,
      incompleteDays: 0,
    };

    for (const day of days as any[]) {
      totals.workedMinutes += day.workedMinutes;
      totals.lateMinutes += day.lateMinutes;
      totals.earlyLeaveMinutes += day.earlyLeaveMinutes;
      totals.overtimeMinutes += day.overtimeMinutes;
      if (day.status === 'PRESENT' || day.status === 'HALF_DAY') totals.presentDays += 1;
      if (day.status === 'ABSENT') totals.absentDays += 1;
      if (day.status === 'LEAVE') totals.leaveDays += 1;
      if (day.status === 'INCOMPLETE') totals.incompleteDays += 1;
    }

    return {
      month,
      ...(personId ? { personId } : {}),
      days,
      totals,
    };
  }

  async findShiftForDate(personId: string, workDate: Date): Promise<any | null> {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: {
        personId,
        effectiveFrom: { lte: workDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!assignment) {
      return null;
    }
    return this.prisma.shift.findUnique({ where: { id: assignment.shiftId } });
  }

  private expectedMinutes(shift: any, workDate: Date, offset: number): number {
    if (!shift) {
      return 0;
    }
    const endDate = shift.crossesMidnight ? addDays(workDate, 1) : workDate;
    const start = localTimeToUtc(workDate, shift.startTime, offset);
    const end = localTimeToUtc(endDate, shift.endTime, offset);
    return Math.max(0, minutesBetween(start, end) - shift.breakMinutes);
  }
}

function pairedMinutes(events: any[]): number {
  let total = 0;
  let open: Date | null = null;
  for (const event of events) {
    if (event.eventType === 'CHECK_IN') {
      if (!open) {
        open = event.eventAt;
      }
    } else if (event.eventType === 'CHECK_OUT' && open) {
      total += minutesBetween(open, event.eventAt);
      open = null;
    }
  }
  return total;
}

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  RateLimitedError,
  uuidv7,
  type EventEnvelope,
} from '@galatura/platform-kit';
import { EncryptionService } from '../src/crypto/encryption.service';
import { AttendanceAuditService } from '../src/audit/audit.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { PeopleConsentClient } from '../src/people/people-consent.client';
import { EnrollmentsService } from '../src/enrollments/enrollments.service';
import { MarkingService } from '../src/marking/marking.service';
import { VerificationRateLimiter } from '../src/marking/verification-rate-limiter';
import { DailyAttendanceService } from '../src/days/daily-attendance.service';
import { CorrectionsService } from '../src/corrections/corrections.service';
import { LeaveService } from '../src/leave/leave.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import {
  cosineSimilarity,
  type FaceAnalysis,
  type FaceEngine,
  type FaceFrame,
} from '../src/face/face-engine';
import { formatDateOnly, localTimeToUtc } from '../src/common/date';

class FakeFaceEngine implements FaceEngine {
  readonly modelName = 'test-face';
  readonly modelVersion = 'test-v1';
  readonly embeddingDim = 2;
  readonly threshold = 0.9;
  readonly livenessThreshold = 0.8;

  async analyze(frame: FaceFrame): Promise<FaceAnalysis> {
    const badLiveness = frame.imageBase64.includes('bad-liveness');
    return {
      embedding: frame.imageBase64.startsWith('face-a') ? [1, 0] : [0, 1],
      qualityScore: 0.95,
      livenessScore: badLiveness ? 0.1 : 0.99,
      livenessPassed: !badLiveness,
    };
  }

  compare(left: number[], right: number[]): number {
    return cosineSimilarity(left, right);
  }
}

const personId = '11111111-1111-4111-8111-111111111111';
const otherPersonId = '22222222-2222-4222-8222-222222222222';
const deviceId = '33333333-3333-4333-8333-333333333333';
const shiftId = '44444444-4444-4444-8444-444444444444';
const leaveTypeId = '55555555-5555-4555-8555-555555555555';

function buildPrisma() {
  const tables: Record<string, any[]> = {
    faceTemplate: [],
    faceVerificationAttempt: [],
    attendanceEvent: [],
    attendanceDay: [],
    shift: [],
    shiftAssignment: [],
    attendanceCorrection: [],
    leaveType: [],
    leaveRequest: [],
    holiday: [],
    outboxEvent: [],
    consentWithdrawalInbox: [],
    attendanceAuditLog: [],
    registeredDevice: [],
  };

  const prisma: any = {
    ...Object.fromEntries(
      Object.keys(tables).map((name) => [
        name,
        {
          findMany: async (args: any = {}) =>
            shape(applyOrder(tables[name].filter((row) => matches(row, args.where)), args.orderBy)).slice(
              0,
              args.take ?? 10_000,
            ),
          findFirst: async (args: any = {}) =>
            applyOrder(tables[name].filter((row) => matches(row, args.where)), args.orderBy)[0] ??
            null,
          findUnique: async (args: any = {}) =>
            tables[name].find((row) => matches(row, args.where)) ?? null,
          create: async (args: any) => {
            const row = {
              id: uuidv7(),
              createdAt: new Date(),
              updatedAt: new Date(),
              ...args.data,
            };
            tables[name].push(row);
            return row;
          },
          update: async (args: any) => {
            const row = tables[name].find((candidate) => matches(candidate, args.where));
            if (!row) return null;
            Object.assign(row, args.data, { updatedAt: new Date() });
            return row;
          },
          updateMany: async (args: any) => {
            const rows = tables[name].filter((row) => matches(row, args.where));
            for (const row of rows) {
              Object.assign(row, args.data, { updatedAt: new Date() });
            }
            return { count: rows.length };
          },
        },
      ]),
    ),
    $transaction: async (fn: any) => fn(prisma),
    __tables: tables,
  };

  return prisma;
}

function shape(rows: any[]): any[] {
  return rows;
}

function applyOrder(rows: any[], orderBy: any): any[] {
  if (!orderBy) return rows;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const [field, direction] = Object.entries(order)[0] as [string, string];
      const compared = compareValues(left[field], right[field]);
      if (compared !== 0) {
        return direction === 'desc' ? -compared : compared;
      }
    }
    return 0;
  });
}

function compareValues(left: any, right: any): number {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function matches(row: any, where: any = {}): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(expected as any[]).some((entry) => matches(row, entry))) return false;
      continue;
    }
    if (key === 'personId_workDate') {
      const value = expected as any;
      if (row.personId !== value.personId || !sameDate(row.workDate, value.workDate)) {
        return false;
      }
      continue;
    }
    if (!valueMatches(row[key], expected)) {
      return false;
    }
  }
  return true;
}

function valueMatches(actual: any, expected: any): boolean {
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof Date) return actual instanceof Date && sameDate(actual, expected);
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('lte' in expected && !(compareValues(actual, expected.lte) <= 0)) return false;
    if ('gte' in expected && !(compareValues(actual, expected.gte) >= 0)) return false;
    if ('gt' in expected && !(compareValues(actual, expected.gt) > 0)) return false;
    if ('lt' in expected && !(compareValues(actual, expected.lt) < 0)) return false;
    if ('in' in expected && !expected.in.includes(actual)) return false;
    if ('not' in expected && actual === expected.not) return false;
    return true;
  }
  return actual === expected;
}

function sameDate(left: any, right: any): boolean {
  return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
}

function buildServices() {
  const prisma = buildPrisma();
  const encryption = new EncryptionService();
  const engine = new FakeFaceEngine();
  const audit = new AttendanceAuditService(prisma);
  const outbox = new OutboxService(prisma);
  const daily = new DailyAttendanceService(prisma, outbox);
  const consentState = { granted: true };
  const consent = {
    assertBiometricConsent: async () => {
      if (!consentState.granted) {
        throw new ForbiddenError('Biometric consent is required before face enrolment.');
      }
      return { consentType: 'BIOMETRIC', granted: true, grantedAt: '2026-01-01T00:00:00.000Z' };
    },
  } as unknown as PeopleConsentClient;

  return {
    prisma,
    encryption,
    engine,
    audit,
    outbox,
    daily,
    consentState,
    enrollments: new EnrollmentsService(prisma, encryption, audit, consent, engine),
    marking: new MarkingService(prisma, encryption, audit, daily, new VerificationRateLimiter(), engine),
    corrections: new CorrectionsService(prisma, daily, audit),
    leave: new LeaveService(prisma, daily, audit),
    shifts: new ShiftsService(prisma),
  };
}

function faceFrames(count = 3): FaceFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    imageBase64: `face-a-${index}-${'x'.repeat(200)}`,
  }));
}

function seedShift(prisma: any, date: string) {
  prisma.__tables.shift.push({
    id: shiftId,
    name: 'Day',
    startTime: '08:00',
    endTime: '17:00',
    graceMinutes: 5,
    breakMinutes: 60,
    crossesMidnight: false,
    active: true,
  });
  prisma.__tables.shiftAssignment.push({
    id: uuidv7(),
    personId,
    shiftId,
    effectiveFrom: new Date(`${date}T00:00:00.000Z`),
    effectiveTo: null,
  });
}

describe('attendance service', () => {
  let services: ReturnType<typeof buildServices>;

  beforeEach(() => {
    services = buildServices();
  });

  it('enrols encrypted templates only with biometric consent and revokes them', async () => {
    const result = await services.enrollments.enrol(
      { personId, frames: faceFrames(3) },
      { actorId: 'user-1' },
    );

    expect(result.templateCount).toBe(3);
    const templates = services.prisma.__tables.faceTemplate;
    expect(templates).toHaveLength(3);
    expect(templates[0].templateEnc).not.toContain('[1,0]');
    expect(JSON.parse(await services.encryption.decrypt(templates[0].templateEnc))).toEqual([1, 0]);
    expect(services.prisma.__tables.attendanceAuditLog[0].action).toBe(
      'face.templates.enrolled',
    );

    services.consentState.granted = false;
    await expect(
      services.enrollments.enrol({ personId: otherPersonId, frames: faceFrames(3) }),
    ).rejects.toThrow(ForbiddenError);

    const revoked = await services.enrollments.revoke(personId, 'employee request', {
      actorId: 'user-1',
    });
    expect(revoked.templateCount).toBe(3);
    expect(templates.every((template: any) => template.templateEnc === '')).toBe(true);
    expect((await services.enrollments.status(personId)).enrolled).toBe(false);
  });

  it('verifies a face, records in/out punches and returns duplicates idempotently', async () => {
    await services.enrollments.enrol({ personId, frames: faceFrames(3) });

    const checkIn = await services.marking.mark(
      {
        clientEventId: '66666666-6666-4666-8666-666666666666',
        personId,
        deviceId,
        imageBase64: 'face-a-mark-1',
      },
      { ip: '127.0.0.1' },
    );
    expect(checkIn.matched).toBe(true);
    expect(checkIn.event.eventType).toBe('CHECK_IN');
    expect(checkIn.day.status).toBe('INCOMPLETE');

    const duplicate = await services.marking.mark({
      clientEventId: '66666666-6666-4666-8666-666666666666',
      personId,
      deviceId,
      imageBase64: 'face-a-mark-1',
    });
    expect(duplicate.duplicate).toBe(true);
    expect(services.prisma.__tables.attendanceEvent).toHaveLength(1);

    const checkOut = await services.marking.mark({
      clientEventId: '77777777-7777-4777-8777-777777777777',
      personId,
      deviceId,
      imageBase64: 'face-a-mark-2',
    });
    expect(checkOut.event.eventType).toBe('CHECK_OUT');
    expect(checkOut.day.status).toBe('PRESENT');
    expect(services.prisma.__tables.faceVerificationAttempt).toHaveLength(2);
  });

  it('rejects liveness failures and below-threshold matches while logging attempts', async () => {
    await services.enrollments.enrol({ personId, frames: faceFrames(3) });

    await expect(
      services.marking.mark({
        clientEventId: '88888888-8888-4888-8888-888888888888',
        personId,
        deviceId,
        imageBase64: 'bad-liveness-frame',
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(services.prisma.__tables.faceVerificationAttempt[0].failureReason).toBe(
      'LIVENESS_FAILED',
    );

    await expect(
      services.marking.mark({
        clientEventId: '99999999-9999-4999-8999-999999999999',
        personId,
        deviceId,
        imageBase64: 'other-face',
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(services.prisma.__tables.faceVerificationAttempt[1].failureReason).toBe(
      'BELOW_THRESHOLD',
    );
  });

  it('rate limits repeated face attempts', async () => {
    const previous = process.env.ATTENDANCE_PERSON_ATTEMPT_LIMIT;
    process.env.ATTENDANCE_PERSON_ATTEMPT_LIMIT = '1';
    try {
      const limiter = new VerificationRateLimiter();
      limiter.check(undefined, personId);
      expect(() => limiter.check(undefined, personId)).toThrow(RateLimitedError);
    } finally {
      if (previous === undefined) {
        delete process.env.ATTENDANCE_PERSON_ATTEMPT_LIMIT;
      } else {
        process.env.ATTENDANCE_PERSON_ATTEMPT_LIMIT = previous;
      }
    }
  });

  it('calculates lateness, worked minutes and overtime against a shift', async () => {
    const date = '2026-11-18';
    seedShift(services.prisma, date);
    const checkIn = localTimeToUtc(date, '08:10', 330);
    const checkOut = localTimeToUtc(date, '18:00', 330);
    services.prisma.__tables.attendanceEvent.push({
      id: uuidv7(),
      personId,
      eventType: 'CHECK_IN',
      eventAt: checkIn,
      workDate: new Date(`${date}T00:00:00.000Z`),
      method: 'FACE',
      clientEventId: uuidv7(),
    });
    services.prisma.__tables.attendanceEvent.push({
      id: uuidv7(),
      personId,
      eventType: 'CHECK_OUT',
      eventAt: checkOut,
      workDate: new Date(`${date}T00:00:00.000Z`),
      method: 'FACE',
      clientEventId: uuidv7(),
    });

    const result = await services.daily.recalculateDay(personId, date);
    expect(result?.day).toMatchObject({
      workedMinutes: 530,
      lateMinutes: 5,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 50,
      status: 'PRESENT',
      shiftId,
    });
  });

  it('closes a day once, writes the outbox event and skips repeats', async () => {
    const date = '2026-11-18';
    seedShift(services.prisma, date);

    const first = await services.daily.closeDate(date);
    expect(first.closed).toBe(1);
    expect(services.prisma.__tables.outboxEvent).toHaveLength(1);

    const envelope = services.prisma.__tables.outboxEvent[0].envelope as EventEnvelope;
    expect(envelope.type).toBe('attendance.day.closed');
    expect(envelope.payload).toMatchObject({
      personId,
      workDate: date,
      status: 'ABSENT',
    });
    expect(JSON.stringify(envelope.payload)).not.toContain('template');

    const second = await services.daily.closeDate(date);
    expect(second.closed).toBe(0);
    expect(services.prisma.__tables.outboxEvent).toHaveLength(1);
    expect(services.prisma.__tables.attendanceDay[0].closedAt).toBeTruthy();
  });

  it('applies approved leave and holidays to daily status', async () => {
    const leaveDate = '2026-11-19';
    services.prisma.__tables.leaveType.push({
      id: leaveTypeId,
      code: 'ANNUAL',
      name: 'Annual',
      paid: true,
      annualQuota: 14,
    });
    const leave = await services.leave.createLeaveRequest(
      {
        personId,
        leaveTypeId,
        fromDate: leaveDate,
        toDate: leaveDate,
        reason: 'Family',
      },
      { actorId: 'user-1' },
    );
    await services.leave.decideLeaveRequest(leave.id, 'APPROVED', { actorId: 'manager-1' });
    expect(services.prisma.__tables.attendanceDay[0].status).toBe('LEAVE');

    const holidayDate = '2026-11-20';
    await services.leave.createHoliday({ date: holidayDate, name: 'Poya' });
    const holiday = await services.daily.recalculateDay(personId, holidayDate, { close: true });
    expect(holiday?.day.status).toBe('HOLIDAY');
  });

  it('approves a correction and recalculates the day from the proposed times', async () => {
    const date = '2026-11-21';
    const correction = await services.corrections.create(
      {
        personId,
        workDate: date,
        proposedIn: `${date}T03:00:00.000Z`,
        proposedOut: `${date}T10:00:00.000Z`,
        reason: 'Missed punch',
      },
      { actorId: 'user-1' },
    );

    const result = await services.corrections.approve(correction.id, { actorId: 'manager-1' });
    expect(result.day).toMatchObject({
      status: 'PRESENT',
      workedMinutes: 420,
    });
    expect(result.day.firstIn.toISOString()).toBe(`${date}T03:00:00.000Z`);
  });

  it('rejects overlapping leave requests and prevents overlapping shift assignments', async () => {
    services.prisma.__tables.leaveType.push({
      id: leaveTypeId,
      code: 'ANNUAL',
      name: 'Annual',
      paid: true,
    });
    await services.leave.createLeaveRequest(
      { personId, leaveTypeId, fromDate: '2026-11-22', toDate: '2026-11-23' },
      { actorId: 'user-1' },
    );
    await expect(
      services.leave.createLeaveRequest(
        { personId, leaveTypeId, fromDate: '2026-11-23', toDate: '2026-11-24' },
        { actorId: 'user-1' },
      ),
    ).rejects.toThrow(ConflictError);

    const shift = await services.shifts.createShift({
      name: 'Day',
      startTime: '08:00',
      endTime: '17:00',
    });
    await services.shifts.createAssignment({
      personId,
      shiftId: shift.id,
      effectiveFrom: '2026-01-01',
    });
    await expect(
      services.shifts.createAssignment({
        personId,
        shiftId: shift.id,
        effectiveFrom: '2026-06-01',
        effectiveTo: '2026-12-31',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('builds monthly totals and daily summaries', async () => {
    services.prisma.__tables.attendanceDay.push({
      id: uuidv7(),
      personId,
      workDate: new Date('2026-11-18T00:00:00.000Z'),
      firstIn: null,
      lastOut: null,
      workedMinutes: 480,
      lateMinutes: 10,
      earlyLeaveMinutes: 5,
      overtimeMinutes: 30,
      status: 'PRESENT',
      approved: false,
    });
    services.prisma.__tables.attendanceDay.push({
      id: uuidv7(),
      personId,
      workDate: new Date('2026-11-19T00:00:00.000Z'),
      firstIn: null,
      lastOut: null,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      status: 'LEAVE',
      approved: false,
    });

    const summary = await services.daily.summary('2026-11-18');
    expect(summary).toMatchObject({ total: 1, present: 1 });
    const report = await services.daily.monthlyReport('2026-11', personId);
    expect(report.totals).toMatchObject({
      workedMinutes: 480,
      lateMinutes: 10,
      earlyLeaveMinutes: 5,
      overtimeMinutes: 30,
      presentDays: 1,
      leaveDays: 1,
    });
    expect(formatDateOnly(report.days[0].workDate)).toBe('2026-11-18');
  });
});

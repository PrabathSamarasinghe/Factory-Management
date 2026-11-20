import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { ErrorCodes, createEvent, toErrorEnvelope, uuidv7, ValidationError } from '../src';

function loadJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as Record<
    string,
    unknown
  >;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validateErrorEnvelope = ajv.compile(loadJson('../../contracts/api/error-envelope.v1.json'));
const validateListEnvelope = ajv.compile(loadJson('../../contracts/api/list-envelope.v1.json'));
const validateEventEnvelope = ajv.compile(
  loadJson('../../event-contracts/schemas/event-envelope.v1.json'),
);
const validateCollectionPayload = ajv.compile(
  loadJson('../../event-contracts/schemas/collection.finalized.v1.json'),
);
const validateTripPayload = ajv.compile(
  loadJson('../../event-contracts/schemas/trip.started.v1.json'),
);
const validateTripEndedPayload = ajv.compile(
  loadJson('../../event-contracts/schemas/trip.ended.v1.json'),
);
const validateAssignmentChangedPayload = ajv.compile(
  loadJson('../../event-contracts/schemas/assignment.changed.v1.json'),
);
const validateAttendanceDayPayload = ajv.compile(
  loadJson('../../event-contracts/schemas/attendance.day.closed.v1.json'),
);
const validateSmsStatusPayload = ajv.compile(
  loadJson('../../event-contracts/schemas/sms.status.v1.json'),
);
const validateAccountCreatedPayload = ajv.compile(
  loadJson('../../event-contracts/schemas/account.created.v1.json'),
);
const validateJournalPostedPayload = ajv.compile(
  loadJson('../../event-contracts/schemas/journal.posted.v1.json'),
);
const validatePaymentPaidPayload = ajv.compile(
  loadJson('../../event-contracts/schemas/payment.paid.v1.json'),
);
const validatePayrollApprovedPayload = ajv.compile(
  loadJson('../../event-contracts/schemas/payroll.approved.v1.json'),
);

function expectValid(validate: ReturnType<typeof ajv.compile>, value: unknown): void {
  const valid = validate(value);
  expect(valid, JSON.stringify(validate.errors)).toBe(true);
}

describe('API contracts', () => {
  it('serialises validation errors in the standard envelope', () => {
    const envelope = toErrorEnvelope(
      new ValidationError('One or more fields are invalid.', [
        { field: 'collectionDate', message: 'Must not be in the future.', code: 'FUTURE_DATE' },
      ]),
      'req-123',
    );
    expectValid(validateErrorEnvelope, envelope);
    expect(envelope.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      requestId: 'req-123',
    });
  });

  it('serialises internal errors without leaking details', () => {
    const envelope = toErrorEnvelope(new Error('connection string leaked'), 'req-456');
    expect(envelope.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId: 'req-456',
    });
    expect(JSON.stringify(envelope)).not.toContain('connection string');
    expectValid(validateErrorEnvelope, envelope);
  });

  it('validates a list envelope', () => {
    expectValid(validateListEnvelope, {
      data: [{ id: uuidv7() }],
      page: { next: null, limit: 50, total: 1 },
    });
    expect(validateListEnvelope({ data: [], page: { limit: 0 } })).toBe(false);
  });

  it('keeps platform error codes in sync with the contract', () => {
    const contract = loadJson('../../contracts/api/error-codes.v1.json') as {
      codes: Array<{ code: string; httpStatus: number }>;
    };
    const byCode = new Map(contract.codes.map((entry) => [entry.code, entry]));

    for (const code of Object.values(ErrorCodes)) {
      expect(byCode.has(code), `missing contract entry for ${code}`).toBe(true);
    }
    expect(new Set(Object.values(ErrorCodes)).size).toBe(Object.values(ErrorCodes).length);
  });
});

describe('event contracts', () => {
  it('validates a collection.finalized event envelope', () => {
    const tripId = uuidv7();
    const supplierId = uuidv7();
    const finalizedBy = uuidv7();
    const payload = {
      tripId,
      supplierId,
      collectionDate: '2026-11-15',
      totalNetKg: '1250.500',
      totalBags: 25,
      finalizedAt: '2026-11-15T10:00:00.000Z',
      finalizedBy,
    };

    expectValid(validateCollectionPayload, payload);

    const envelope = createEvent({
      type: 'collection.finalized',
      payload,
      actor: { type: 'USER', id: finalizedBy },
      producer: 'collection-service',
      correlationId: uuidv7(),
    });

    expectValid(validateEventEnvelope, envelope);
  });

  it('validates a trip.started event envelope', () => {
    const payload = {
      tripId: uuidv7(),
      routeId: uuidv7(),
      lorryId: uuidv7(),
      ownerPersonId: uuidv7(),
      startedAt: '2026-11-15T06:00:00.000Z',
      startOdometerKm: '12345.6',
    };

    expectValid(validateTripPayload, payload);
    expectValid(
      validateEventEnvelope,
      createEvent({
        type: 'trip.started',
        payload,
        actor: { type: 'USER', id: uuidv7() },
        producer: 'fleet-service',
      }),
    );
  });

  it('validates trip.ended and assignment.changed event envelopes', () => {
    const tripEndedPayload = {
      tripId: uuidv7(),
      routeId: uuidv7(),
      lorryId: uuidv7(),
      ownerPersonId: uuidv7(),
      startedAt: '2026-11-18T06:00:00.000Z',
      endedAt: '2026-11-18T14:30:00.000Z',
      startOdometerKm: '12345.6',
      endOdometerKm: '12402.1',
      distanceKm: '56.5',
      endedBy: uuidv7(),
    };
    expectValid(validateTripEndedPayload, tripEndedPayload);
    expect(validateTripEndedPayload({ ...tripEndedPayload, distanceKm: '-1.0' })).toBe(false);
    expectValid(
      validateEventEnvelope,
      createEvent({
        type: 'trip.ended',
        payload: tripEndedPayload,
        actor: { type: 'USER', id: tripEndedPayload.endedBy },
        producer: 'fleet-service',
      }),
    );

    const assignmentPayload = {
      assignmentId: uuidv7(),
      previousAssignmentId: uuidv7(),
      routeId: uuidv7(),
      lorryId: uuidv7(),
      driverId: uuidv7(),
      helperId: null,
      supervisorId: null,
      effectiveFrom: '2026-11-19',
      effectiveTo: null,
      weekdays: [1, 3, 5],
      status: 'ACTIVE',
      changeReason: 'Driver changed after licence check.',
      changedBy: uuidv7(),
      changedAt: '2026-11-18T15:00:00.000Z',
    };
    expectValid(validateAssignmentChangedPayload, assignmentPayload);
    expect(validateAssignmentChangedPayload({ ...assignmentPayload, weekdays: [1, 8] })).toBe(
      false,
    );
    expectValid(
      validateEventEnvelope,
      createEvent({
        type: 'assignment.changed',
        payload: assignmentPayload,
        actor: { type: 'USER', id: assignmentPayload.changedBy },
        producer: 'fleet-service',
      }),
    );
  });

  it('validates an attendance.day.closed event envelope', () => {
    const payload = {
      personId: uuidv7(),
      workDate: '2026-11-18',
      status: 'PRESENT',
      firstIn: '2026-11-18T03:55:00.000Z',
      lastOut: '2026-11-18T13:05:00.000Z',
      workedMinutes: 550,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 25,
      shiftId: uuidv7(),
      approved: true,
    };

    expectValid(validateAttendanceDayPayload, payload);
    expect(validateAttendanceDayPayload({ ...payload, status: 'PRESENT_' })).toBe(false);
    expect(validateAttendanceDayPayload({ ...payload, workedMinutes: -1 })).toBe(false);
    expectValid(
      validateEventEnvelope,
      createEvent({
        type: 'attendance.day.closed',
        payload,
        actor: { type: 'SYSTEM' },
        producer: 'attendance-service',
      }),
    );
  });

  it('validates sms status event envelopes without phone numbers', () => {
    const messageId = uuidv7();
    const relatedId = uuidv7();
    const payload = {
      messageId,
      relatedType: 'DailySupplierTotal',
      relatedId,
      provider: 'FAKE',
      attempts: 1,
      sentAt: '2026-11-18T10:00:00.000Z',
    };
    expectValid(validateSmsStatusPayload, payload);
    expectValid(
      validateEventEnvelope,
      createEvent({
        type: 'sms.sent',
        payload,
        actor: { type: 'SYSTEM' },
        producer: 'notification-service',
      }),
    );
    expect(validateSmsStatusPayload({ ...payload, relatedId: 'not-a-uuid' })).toBe(false);
  });

  it('validates account.created without account numbers or PII', () => {
    const payload = {
      accountId: uuidv7(),
      code: '1110',
      name: 'Bank - main account',
      accountType: 'ASSET',
    };

    expectValid(validateAccountCreatedPayload, payload);
    expectValid(
      validateEventEnvelope,
      createEvent({
        type: 'account.created',
        payload,
        actor: { type: 'USER', id: uuidv7() },
        producer: 'accounts-service',
      }),
    );
    expect(validateAccountCreatedPayload({ ...payload, accountType: 'ASSET_' })).toBe(false);
    expect(validateAccountCreatedPayload({ ...payload, bankAccountNumber: '0001234567' })).toBe(
      false,
    );
  });

  it('validates journal.posted with decimal-string totals and nullable sourceId', () => {
    const payload = {
      journalEntryId: uuidv7(),
      entryNo: '42',
      entryDate: '2026-11-20',
      periodId: uuidv7(),
      debitTotal: '12500.00',
      creditTotal: '12500.00',
      sourceType: 'COLLECTION',
      sourceId: uuidv7(),
    };

    expectValid(validateJournalPostedPayload, payload);
    expectValid(validateJournalPostedPayload, { ...payload, sourceId: null });
    expectValid(
      validateEventEnvelope,
      createEvent({
        type: 'journal.posted',
        payload,
        actor: { type: 'SERVICE', id: uuidv7() },
        producer: 'accounts-service',
      }),
    );
    expect(validateJournalPostedPayload({ ...payload, debitTotal: 12500 })).toBe(false);
    expect(validateJournalPostedPayload({ ...payload, entryDate: '2026-11-20T00:00:00Z' })).toBe(
      false,
    );
    expect(validateJournalPostedPayload({ ...payload, employeeBankDetails: 'hidden' })).toBe(false);
  });

  it('validates payment.paid with a payee id and no bank details', () => {
    const payload = {
      paymentId: uuidv7(),
      payeeType: 'SUPPLIER',
      payeeId: uuidv7(),
      amount: '2500.50',
      paidDate: '2026-11-20T10:00:00.000Z',
      journalEntryId: uuidv7(),
    };

    expectValid(validatePaymentPaidPayload, payload);
    expectValid(
      validateEventEnvelope,
      createEvent({
        type: 'payment.paid',
        payload,
        actor: { type: 'USER', id: uuidv7() },
        producer: 'accounts-service',
      }),
    );
    expect(validatePaymentPaidPayload({ ...payload, amount: 2500.5 })).toBe(false);
    expect(validatePaymentPaidPayload({ ...payload, payeeId: 'not-a-uuid' })).toBe(false);
    expect(validatePaymentPaidPayload({ ...payload, bankAccountNumber: '0001234567' })).toBe(false);
  });

  it('validates payroll.approved with decimal-string totals and no employee PII', () => {
    const payload = {
      payrollRunId: uuidv7(),
      periodFrom: '2026-11-01',
      periodTo: '2026-11-30',
      grossTotal: '150000.00',
      deductionTotal: '22500.00',
      netTotal: '127500.00',
      journalEntryId: uuidv7(),
    };

    expectValid(validatePayrollApprovedPayload, payload);
    expectValid(
      validateEventEnvelope,
      createEvent({
        type: 'payroll.approved',
        payload,
        actor: { type: 'USER', id: uuidv7() },
        producer: 'accounts-service',
      }),
    );
    expect(validatePayrollApprovedPayload({ ...payload, periodFrom: '2026-11-01T00:00:00Z' })).toBe(
      false,
    );
    expect(validatePayrollApprovedPayload({ ...payload, employeeBankDetails: 'hidden' })).toBe(
      false,
    );
  });

  it('rejects malformed events', () => {
    const envelope = createEvent({
      type: 'collection.finalized',
      payload: {},
      actor: { type: 'SYSTEM' },
    });
    expectValid(validateEventEnvelope, envelope);
    expect(validateEventEnvelope({ ...envelope, id: 'not-a-uuid' })).toBe(false);
    expect(validateEventEnvelope({ ...envelope, type: 'collection_finalized' })).toBe(false);
    expect(validateCollectionPayload({})).toBe(false);
  });
});

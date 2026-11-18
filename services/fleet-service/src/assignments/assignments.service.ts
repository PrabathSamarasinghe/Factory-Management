import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  createEvent,
  NotFoundError,
  ValidationError,
  uuidv7,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { FleetAuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import type { RequestContext } from '../common/request';
import {
  dateOnly,
  formatDateOnly,
  optionalDateOnly,
  optionalString,
  overlap,
  requiredString,
  todayDateOnly,
  weekdays,
} from '../common/validation';

const ASSIGNMENT_STATUSES = ['ACTIVE', 'ENDED'] as const;
type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export interface CreateAssignmentInput {
  routeId?: unknown;
  lorryId?: unknown;
  driverId?: unknown;
  helperId?: unknown;
  supervisorId?: unknown;
  effectiveFrom?: unknown;
  effectiveTo?: unknown;
  weekdays?: unknown;
}

export interface ChangeAssignmentInput extends CreateAssignmentInput {
  effectiveFrom?: unknown;
  changeReason?: unknown;
}

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FleetAuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(query: { routeId?: string; lorryId?: string; date?: string; status?: string }) {
    const status = query.status ? this.status(query.status) : undefined;
    const date = query.date ? dateOnly(query.date, 'date') : undefined;
    return this.prisma.routeAssignment.findMany({
      where: {
        ...(query.routeId ? { routeId: query.routeId } : {}),
        ...(query.lorryId ? { lorryId: query.lorryId } : {}),
        ...(status ? { status } : {}),
        ...(date
          ? {
              effectiveFrom: { lte: date },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
            }
          : {}),
      },
      include: {
        route: { select: { id: true, code: true, name: true } },
        lorry: { select: { id: true, registrationNo: true, make: true, model: true } },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(input: CreateAssignmentInput, context: RequestContext) {
    const routeId = requiredString(input.routeId, 'routeId');
    const lorryId = requiredString(input.lorryId, 'lorryId');
    const effectiveFrom = dateOnly(input.effectiveFrom, 'effectiveFrom');
    const effectiveTo = optionalDateOnly(input.effectiveTo, 'effectiveTo');
    this.validateRange(effectiveFrom, effectiveTo);
    await this.requireReferences(routeId, lorryId);
    await this.ensureNoOverlap(lorryId, effectiveFrom, effectiveTo);
    const assignmentWeekdays = weekdays(input.weekdays);

    const assignment = await this.prisma.routeAssignment.create({
      data: {
        routeId,
        lorryId,
        driverId: optionalString(input.driverId),
        helperId: optionalString(input.helperId),
        supervisorId: optionalString(input.supervisorId),
        effectiveFrom,
        effectiveTo,
        weekdays: assignmentWeekdays,
        status: 'ACTIVE',
        changedBy: context.actorId,
      },
      include: {
        route: { select: { id: true, code: true, name: true } },
        lorry: { select: { id: true, registrationNo: true } },
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'assignment.created',
      entityType: 'RouteAssignment',
      entityId: assignment.id,
      metadata: { routeId, lorryId, effectiveFrom: formatDateOnly(effectiveFrom) },
      ip: context.ip,
    });
    return assignment;
  }

  async change(id: string, input: ChangeAssignmentInput, context: RequestContext) {
    const existing = await this.prisma.routeAssignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Assignment not found.');
    if (existing.status !== 'ACTIVE') {
      throw new ConflictError('Only an active assignment can be changed.');
    }
    const changeReason = requiredString(input.changeReason, 'changeReason');
    const effectiveFrom = input.effectiveFrom
      ? dateOnly(input.effectiveFrom, 'effectiveFrom')
      : todayDateOnly();
    if (effectiveFrom.getTime() < existing.effectiveFrom.getTime()) {
      throw new ValidationError('effectiveFrom cannot be before the current assignment starts.');
    }
    const routeId =
      input.routeId === undefined ? existing.routeId : requiredString(input.routeId, 'routeId');
    const lorryId =
      input.lorryId === undefined ? existing.lorryId : requiredString(input.lorryId, 'lorryId');
    const effectiveTo =
      input.effectiveTo === undefined
        ? (existing.effectiveTo ?? undefined)
        : input.effectiveTo === null
          ? undefined
          : dateOnly(input.effectiveTo, 'effectiveTo');
    this.validateRange(effectiveFrom, effectiveTo);
    await this.requireReferences(routeId, lorryId);
    if (
      lorryId !== existing.lorryId ||
      effectiveFrom.getTime() !== existing.effectiveFrom.getTime()
    ) {
      await this.ensureNoOverlap(lorryId, effectiveFrom, effectiveTo, id);
    }

    const assignmentWeekdays =
      input.weekdays === undefined ? existing.weekdays : weekdays(input.weekdays);
    const now = new Date();
    const assignment = await this.prisma.$transaction(async (tx: any) => {
      await tx.routeAssignment.update({
        where: { id },
        data: {
          status: 'ENDED',
          effectiveTo: effectiveFrom,
          version: { increment: 1 },
        },
      });
      const created = await tx.routeAssignment.create({
        data: {
          id: uuidv7(),
          routeId,
          lorryId,
          driverId: input.driverId === undefined ? existing.driverId : nullableId(input.driverId),
          helperId: input.helperId === undefined ? existing.helperId : nullableId(input.helperId),
          supervisorId:
            input.supervisorId === undefined
              ? existing.supervisorId
              : nullableId(input.supervisorId),
          effectiveFrom,
          effectiveTo,
          weekdays: assignmentWeekdays,
          status: 'ACTIVE',
          changeReason,
          changedBy: context.actorId,
          previousAssignmentId: existing.id,
        },
      });
      const event = createEvent({
        type: 'assignment.changed',
        version: 1,
        producer: 'fleet-service',
        occurredAt: now,
        actor: { type: context.actorId ? 'USER' : 'SYSTEM', id: context.actorId ?? null },
        payload: {
          assignmentId: created.id,
          previousAssignmentId: existing.id,
          routeId,
          lorryId,
          driverId: created.driverId,
          helperId: created.helperId,
          supervisorId: created.supervisorId,
          effectiveFrom: formatDateOnly(created.effectiveFrom),
          effectiveTo: created.effectiveTo ? formatDateOnly(created.effectiveTo) : null,
          weekdays: created.weekdays,
          status: created.status,
          changeReason,
          changedBy: context.actorId ?? null,
          changedAt: now.toISOString(),
        },
      });
      await this.outbox.append(event, tx);
      return created;
    });

    await this.audit.record({
      actorId: context.actorId,
      action: 'assignment.changed',
      entityType: 'RouteAssignment',
      entityId: assignment.id,
      metadata: { previousAssignmentId: existing.id, changeReason },
      ip: context.ip,
    });
    return { previousAssignmentId: existing.id, assignment };
  }

  private async requireReferences(routeId: string, lorryId: string) {
    const [route, lorry] = await Promise.all([
      this.prisma.route.findUnique({ where: { id: routeId } }),
      this.prisma.lorry.findUnique({ where: { id: lorryId } }),
    ]);
    if (!route) throw new NotFoundError('Route not found.');
    if (!lorry) throw new NotFoundError('Lorry not found.');
    if (lorry.status === 'RETIRED') {
      throw new ConflictError('A retired lorry cannot be assigned.');
    }
  }

  private async ensureNoOverlap(
    lorryId: string,
    effectiveFrom: Date,
    effectiveTo: Date | undefined,
    excludeId?: string,
  ) {
    const rows = await this.prisma.routeAssignment.findMany({
      where: { lorryId, status: 'ACTIVE' },
    });
    const conflict = (rows as any[]).find(
      (row) =>
        row.id !== excludeId &&
        overlap(effectiveFrom, effectiveTo, row.effectiveFrom, row.effectiveTo),
    );
    if (conflict) {
      throw new ConflictError(
        'The lorry already has an active assignment that overlaps this date range.',
        { details: { assignmentId: conflict.id } },
      );
    }
  }

  private validateRange(from: Date, to: Date | undefined) {
    if (to && to.getTime() < from.getTime()) {
      throw new ValidationError('effectiveTo cannot be before effectiveFrom.');
    }
  }

  private status(value: unknown): AssignmentStatus {
    if (typeof value !== 'string' || !ASSIGNMENT_STATUSES.includes(value as AssignmentStatus)) {
      throw new ValidationError(`status must be one of ${ASSIGNMENT_STATUSES.join(', ')}.`);
    }
    return value as AssignmentStatus;
  }
}

function nullableId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return optionalString(value) ?? null;
}

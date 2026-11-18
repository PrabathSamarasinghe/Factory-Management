import { Injectable } from '@nestjs/common';
import { ConflictError, isUuid, NotFoundError, uuidv7, ValidationError } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnly } from '../common/date';

export interface CreateShiftInput {
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes?: number;
  breakMinutes?: number;
  crossesMidnight?: boolean;
}

export interface CreateShiftAssignmentInput {
  personId: string;
  shiftId: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async listShifts(active?: boolean) {
    return this.prisma.shift.findMany({
      where: active === undefined ? {} : { active },
      orderBy: { name: 'asc' },
    });
  }

  async createShift(input: CreateShiftInput) {
    validateShift(input);
    return this.prisma.shift.create({
      data: {
        id: uuidv7(),
        name: input.name.trim(),
        startTime: input.startTime,
        endTime: input.endTime,
        graceMinutes: input.graceMinutes ?? 0,
        breakMinutes: input.breakMinutes ?? 0,
        crossesMidnight: input.crossesMidnight ?? false,
        active: true,
      },
    });
  }

  async updateShift(id: string, input: Partial<CreateShiftInput> & { active?: boolean }) {
    const existing = await this.prisma.shift.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Shift "${id}" was not found.`);
    }

    const merged = {
      name: input.name ?? existing.name,
      startTime: input.startTime ?? existing.startTime,
      endTime: input.endTime ?? existing.endTime,
      graceMinutes: input.graceMinutes ?? existing.graceMinutes,
      breakMinutes: input.breakMinutes ?? existing.breakMinutes,
      crossesMidnight: input.crossesMidnight ?? existing.crossesMidnight,
    };
    validateShift(merged);

    return this.prisma.shift.update({
      where: { id },
      data: { ...merged, ...(input.active === undefined ? {} : { active: input.active }) },
    });
  }

  async listAssignments(personId?: string) {
    return this.prisma.shiftAssignment.findMany({
      where: personId ? { personId } : {},
      orderBy: [{ personId: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  async createAssignment(input: CreateShiftAssignmentInput) {
    if (!isUuid(input.personId)) {
      throw new ValidationError('personId must be a UUID.');
    }
    if (!isUuid(input.shiftId)) {
      throw new ValidationError('shiftId must be a UUID.');
    }
    const shift = await this.prisma.shift.findUnique({ where: { id: input.shiftId } });
    if (!shift) {
      throw new NotFoundError(`Shift "${input.shiftId}" was not found.`);
    }

    const effectiveFrom = dateOnly(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
    if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
      throw new ValidationError('effectiveTo must not be before effectiveFrom.');
    }

    const existing = await this.prisma.shiftAssignment.findMany({
      where: { personId: input.personId },
    });
    for (const assignment of existing as any[]) {
      if (overlaps(effectiveFrom, effectiveTo, assignment.effectiveFrom, assignment.effectiveTo)) {
        throw new ConflictError('The person already has a shift assignment in that period.');
      }
    }

    return this.prisma.shiftAssignment.create({
      data: {
        id: uuidv7(),
        personId: input.personId,
        shiftId: input.shiftId,
        effectiveFrom,
        effectiveTo,
      },
    });
  }

  async updateAssignment(
    id: string,
    input: { effectiveFrom?: string; effectiveTo?: string | null; shiftId?: string },
  ) {
    const existing = await this.prisma.shiftAssignment.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Shift assignment "${id}" was not found.`);
    }

    const effectiveFrom = input.effectiveFrom
      ? dateOnly(input.effectiveFrom)
      : existing.effectiveFrom;
    const effectiveTo =
      input.effectiveTo === null
        ? null
        : input.effectiveTo
          ? dateOnly(input.effectiveTo)
          : existing.effectiveTo;
    if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
      throw new ValidationError('effectiveTo must not be before effectiveFrom.');
    }

    return this.prisma.shiftAssignment.update({
      where: { id },
      data: {
        effectiveFrom,
        effectiveTo,
        ...(input.shiftId ? { shiftId: input.shiftId } : {}),
      },
    });
  }
}

function validateShift(input: CreateShiftInput): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError('Shift name is required.');
  }
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(input.startTime) || !timePattern.test(input.endTime)) {
    throw new ValidationError('Shift times must use HH:mm format.');
  }
  if ((input.graceMinutes ?? 0) < 0 || (input.breakMinutes ?? 0) < 0) {
    throw new ValidationError('Shift grace and break minutes must not be negative.');
  }
  const crossesMidnight =
    input.crossesMidnight ?? input.endTime <= input.startTime;
  if (!crossesMidnight && input.endTime <= input.startTime) {
    throw new ValidationError('A shift that ends before it starts must cross midnight.');
  }
}

function overlaps(
  newFrom: Date,
  newTo: Date | null,
  oldFrom: Date,
  oldTo: Date | null,
): boolean {
  const newEnd = newTo?.getTime() ?? Number.POSITIVE_INFINITY;
  const oldEnd = oldTo?.getTime() ?? Number.POSITIVE_INFINITY;
  return newFrom.getTime() <= oldEnd && oldFrom.getTime() <= newEnd;
}

import { Injectable } from '@nestjs/common';
import {
  BusinessRuleError,
  ConflictError,
  createEvent,
  NotFoundError,
  ValidationError,
  uuidv7,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { FleetAuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { CollectionReadinessClient } from '../collection/collection-readiness.client';
import type { RequestContext } from '../common/request';
import {
  dateOnly,
  dateTime,
  decimalString,
  decimalText,
  formatDateOnly,
  optionalDateTime,
  optionalString,
  requiredString,
  todayDateOnly,
} from '../common/validation';

const ACTIVE_TRIP_STATUSES = ['IN_PROGRESS', 'AT_FACTORY', 'WEIGHING'];
const TRIP_EVENT_TYPES = ['STOP_ARRIVED', 'STOP_SKIPPED', 'BREAKDOWN', 'NOTE'] as const;
type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

export interface StartTripInput {
  clientTripId?: unknown;
  routeAssignmentId?: unknown;
  routeId?: unknown;
  lorryId?: unknown;
  driverId?: unknown;
  helperId?: unknown;
  supervisorId?: unknown;
  tripDate?: unknown;
  startedAt?: unknown;
  startOdometerKm?: unknown;
  startOdometerPhotoKey?: unknown;
  startLat?: unknown;
  startLng?: unknown;
  remarks?: unknown;
}

export interface TripListQuery {
  from?: string;
  to?: string;
  lorryId?: string;
  routeId?: string;
  status?: string;
}

export interface TripEventInput {
  eventType?: unknown;
  routeStopId?: unknown;
  occurredAt?: unknown;
  lat?: unknown;
  lng?: unknown;
  note?: unknown;
  clientEventId?: unknown;
}

export interface EndTripInput {
  endOdometerKm?: unknown;
  endOdometerPhotoKey?: unknown;
  endLat?: unknown;
  endLng?: unknown;
  remarks?: unknown;
}

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FleetAuditService,
    private readonly outbox: OutboxService,
    private readonly collections: CollectionReadinessClient,
  ) {}

  async start(input: StartTripInput, context: RequestContext) {
    const clientTripId = requiredString(input.clientTripId, 'clientTripId');
    const duplicate = await this.prisma.trip.findUnique({ where: { clientTripId } });
    if (duplicate) return duplicate;

    const tripDate = input.tripDate ? dateOnly(input.tripDate, 'tripDate') : todayDateOnly();
    const assignment = await this.resolveAssignment(input, tripDate);
    const routeId = assignment ? assignment.routeId : requiredString(input.routeId, 'routeId');
    const lorryId = assignment ? assignment.lorryId : requiredString(input.lorryId, 'lorryId');
    const [route, lorry] = await Promise.all([
      this.prisma.route.findUnique({ where: { id: routeId } }),
      this.prisma.lorry.findUnique({ where: { id: lorryId } }),
    ]);
    if (!route) throw new NotFoundError('Route not found.');
    if (!lorry) throw new NotFoundError('Lorry not found.');
    if (lorry.status === 'RETIRED') throw new ConflictError('A retired lorry cannot start a trip.');
    if (!context.actorId) throw new ValidationError('x-user-id is required to start a trip.');

    const startOdometerKm = decimalString(input.startOdometerKm, 'startOdometerKm');
    if (Number(startOdometerKm) < Number(lorry.currentOdometerKm)) {
      throw new ValidationError(
        `startOdometerKm cannot be lower than the lorry odometer (${decimalText(lorry.currentOdometerKm)}).`,
      );
    }
    const activeTrip = await this.prisma.trip.findFirst({
      where: { lorryId, status: { in: ACTIVE_TRIP_STATUSES as any } },
    });
    if (activeTrip) {
      throw new ConflictError('This lorry already has a trip in progress.', {
        details: { tripId: activeTrip.id },
      });
    }

    const startedAt = input.startedAt ? dateTime(input.startedAt, 'startedAt') : new Date();
    const driverId =
      input.driverId === undefined ? (assignment?.driverId ?? null) : nullableId(input.driverId);
    const helperId =
      input.helperId === undefined ? (assignment?.helperId ?? null) : nullableId(input.helperId);
    const supervisorId =
      input.supervisorId === undefined
        ? (assignment?.supervisorId ?? null)
        : nullableId(input.supervisorId);

    const trip = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.trip.create({
        data: {
          routeAssignmentId: assignment?.id,
          routeId,
          lorryId,
          driverId,
          helperId,
          supervisorId,
          ownerPersonId: context.actorId!,
          tripDate,
          status: 'IN_PROGRESS',
          startedAt,
          startOdometerKm,
          startOdometerPhotoKey: optionalString(input.startOdometerPhotoKey),
          startedBy: context.actorId,
          startLat: decimalString(input.startLat, 'startLat', false),
          startLng: decimalString(input.startLng, 'startLng', false),
          clientTripId,
          remarks: optionalString(input.remarks),
        },
      });
      if (Number(startOdometerKm) > Number(lorry.currentOdometerKm)) {
        await tx.lorry.update({
          where: { id: lorryId },
          data: { currentOdometerKm: startOdometerKm, version: { increment: 1 } },
        });
      }
      const event = createEvent({
        type: 'trip.started',
        version: 1,
        producer: 'fleet-service',
        occurredAt: startedAt,
        actor: { type: 'USER', id: context.actorId! },
        payload: {
          tripId: created.id,
          routeId,
          lorryId,
          routeAssignmentId: assignment?.id ?? null,
          driverId,
          helperId,
          supervisorId,
          ownerPersonId: context.actorId!,
          startedAt: startedAt.toISOString(),
          startOdometerKm: decimalText(startOdometerKm),
        },
      });
      await this.outbox.append(event, tx);
      await this.audit.record(
        {
          actorId: context.actorId,
          action: 'trip.started',
          entityType: 'Trip',
          entityId: created.id,
          metadata: { routeId, lorryId, startOdometerKm: decimalText(startOdometerKm) },
          ip: context.ip,
        },
        tx,
      );
      return created;
    });

    return trip;
  }

  async mineToday(context: RequestContext, now = new Date()) {
    if (!context.actorId) throw new ValidationError('x-user-id is required.');
    return this.prisma.trip.findMany({
      where: { ownerPersonId: context.actorId, tripDate: todayDateOnly(now) },
      include: {
        route: { select: { id: true, code: true, name: true } },
        lorry: { select: { id: true, registrationNo: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async list(query: TripListQuery) {
    return this.prisma.trip.findMany({
      where: {
        ...(query.from ? { tripDate: { gte: dateOnly(query.from, 'from') } } : {}),
        ...(query.to
          ? {
              tripDate: {
                ...(query.from ? { gte: dateOnly(query.from, 'from') } : {}),
                lte: dateOnly(query.to, 'to'),
              },
            }
          : {}),
        ...(query.lorryId ? { lorryId: query.lorryId } : {}),
        ...(query.routeId ? { routeId: query.routeId } : {}),
        ...(query.status ? { status: query.status as any } : {}),
      },
      include: {
        route: { select: { id: true, code: true, name: true } },
        lorry: { select: { id: true, registrationNo: true } },
      },
      orderBy: [{ tripDate: 'desc' }, { startedAt: 'desc' }],
      take: 250,
    });
  }

  async get(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        route: true,
        lorry: true,
        events: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!trip) throw new NotFoundError('Trip not found.');
    return { ...trip, collectionsSummary: null, collectionsReadiness: null };
  }

  async addEvent(id: string, input: TripEventInput, context: RequestContext) {
    const clientEventId = requiredString(input.clientEventId, 'clientEventId');
    const duplicate = await this.prisma.tripEvent.findUnique({ where: { clientEventId } });
    if (duplicate) {
      if (duplicate.tripId !== id) {
        throw new ConflictError('clientEventId has already been used for another trip.');
      }
      return duplicate;
    }
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundError('Trip not found.');
    if (!ACTIVE_TRIP_STATUSES.includes(trip.status)) {
      throw new ConflictError('Events can only be recorded while the trip is active.');
    }
    const eventType = this.eventType(input.eventType);
    const routeStopId = optionalString(input.routeStopId);
    if (routeStopId) {
      const stop = await this.prisma.routeStop.findUnique({ where: { id: routeStopId } });
      if (!stop || stop.routeId !== trip.routeId) {
        throw new ValidationError('routeStopId does not belong to this trip route.');
      }
    }
    const event = await this.prisma.tripEvent.create({
      data: {
        tripId: id,
        eventType,
        routeStopId,
        occurredAt: input.occurredAt ? dateTime(input.occurredAt, 'occurredAt') : new Date(),
        lat: decimalString(input.lat, 'lat', false),
        lng: decimalString(input.lng, 'lng', false),
        note: optionalString(input.note),
        clientEventId,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'trip.event.recorded',
      entityType: 'Trip',
      entityId: id,
      metadata: { eventType, routeStopId: routeStopId ?? null },
      ip: context.ip,
    });
    return event;
  }

  async arriveFactory(id: string, context: RequestContext) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundError('Trip not found.');
    if (trip.status === 'AT_FACTORY' || trip.status === 'WEIGHING') return trip;
    if (trip.status !== 'IN_PROGRESS') {
      throw new ConflictError(`A trip in ${trip.status} cannot arrive at the factory.`);
    }
    const updated = await this.prisma.trip.update({
      where: { id },
      data: { status: 'AT_FACTORY', version: { increment: 1 } },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'trip.arrived_factory',
      entityType: 'Trip',
      entityId: id,
      ip: context.ip,
    });
    return updated;
  }

  async end(id: string, input: EndTripInput, context: RequestContext) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundError('Trip not found.');
    if (trip.status === 'COMPLETED') return trip;
    if (trip.status !== 'AT_FACTORY' && trip.status !== 'WEIGHING') {
      throw new ConflictError('The trip must be at the factory before it can be ended.');
    }
    const endOdometerKm = decimalString(input.endOdometerKm, 'endOdometerKm');
    if (Number(endOdometerKm) < Number(trip.startOdometerKm)) {
      throw new ValidationError('endOdometerKm must be greater than or equal to startOdometerKm.');
    }

    const readiness = await this.collections.check(id);
    if (!readiness.ready || !readiness.totalsFinalized) {
      throw new BusinessRuleError(
        'The trip cannot be ended until every supplier pickup has a weighing and totals are finalised.',
        { details: readiness },
      );
    }

    const now = new Date();
    const ended = await this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.trip.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          endedAt: now,
          endOdometerKm,
          endOdometerPhotoKey: optionalString(input.endOdometerPhotoKey),
          endLat: decimalString(input.endLat, 'endLat', false),
          endLng: decimalString(input.endLng, 'endLng', false),
          endedBy: context.actorId,
          remarks: optionalString(input.remarks) ?? trip.remarks,
          version: { increment: 1 },
        },
      });
      const lorry = await tx.lorry.findUnique({ where: { id: trip.lorryId } });
      if (lorry && Number(endOdometerKm) > Number(lorry.currentOdometerKm)) {
        await tx.lorry.update({
          where: { id: trip.lorryId },
          data: { currentOdometerKm: endOdometerKm, version: { increment: 1 } },
        });
      }
      const event = createEvent({
        type: 'trip.ended',
        version: 1,
        producer: 'fleet-service',
        occurredAt: now,
        actor: {
          type: context.actorId ? 'USER' : 'SYSTEM',
          id: context.actorId ?? null,
        },
        payload: {
          tripId: id,
          routeId: trip.routeId,
          lorryId: trip.lorryId,
          ownerPersonId: trip.ownerPersonId,
          startedAt: trip.startedAt ? trip.startedAt.toISOString() : null,
          endedAt: now.toISOString(),
          startOdometerKm: decimalText(trip.startOdometerKm),
          endOdometerKm: decimalText(endOdometerKm),
          distanceKm: decimalText(Number(endOdometerKm) - Number(trip.startOdometerKm)),
          endedBy: context.actorId ?? null,
        },
      });
      await this.outbox.append(event, tx);
      await this.audit.record(
        {
          actorId: context.actorId,
          action: 'trip.ended',
          entityType: 'Trip',
          entityId: id,
          metadata: { endOdometerKm: decimalText(endOdometerKm) },
          ip: context.ip,
        },
        tx,
      );
      return updated;
    });

    return ended;
  }

  async cancel(id: string, input: { remarks?: unknown }, context: RequestContext) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundError('Trip not found.');
    if (trip.status === 'CANCELLED') return trip;
    if (trip.status === 'COMPLETED')
      throw new ConflictError('A completed trip cannot be cancelled.');
    const remarks = requiredString(input.remarks, 'remarks');
    const updated = await this.prisma.trip.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        endedAt: new Date(),
        endedBy: context.actorId,
        remarks,
        version: { increment: 1 },
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'trip.cancelled',
      entityType: 'Trip',
      entityId: id,
      metadata: { remarks },
      ip: context.ip,
    });
    return updated;
  }

  async masterData(updatedSince?: string) {
    const since = updatedSince ? dateTime(updatedSince, 'updatedSince') : undefined;
    const filter = since ? { updatedAt: { gt: since } } : {};
    const [routes, stops, assignments] = await Promise.all([
      this.prisma.route.findMany({ where: filter, orderBy: { code: 'asc' } }),
      this.prisma.routeStop.findMany({
        where: filter,
        orderBy: [{ routeId: 'asc' }, { sequence: 'asc' }],
      }),
      this.prisma.routeAssignment.findMany({
        where: filter,
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      updatedSince: since ? since.toISOString() : null,
      routes,
      stops,
      assignments,
    };
  }

  private async resolveAssignment(input: StartTripInput, tripDate: Date) {
    if (input.routeAssignmentId) {
      const assignment = await this.prisma.routeAssignment.findUnique({
        where: { id: requiredString(input.routeAssignmentId, 'routeAssignmentId') },
      });
      if (!assignment) throw new NotFoundError('Route assignment not found.');
      if (assignment.status !== 'ACTIVE') {
        throw new ConflictError('The route assignment is not active.');
      }
      if (!this.coversDate(assignment, tripDate)) {
        throw new ConflictError('The route assignment does not cover the trip date.');
      }
      return assignment;
    }

    if (!input.routeId || !input.lorryId) return null;
    const candidates = await this.prisma.routeAssignment.findMany({
      where: {
        routeId: requiredString(input.routeId, 'routeId'),
        lorryId: requiredString(input.lorryId, 'lorryId'),
        status: 'ACTIVE',
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return (
      (candidates as any[]).find((assignment) => this.coversDate(assignment, tripDate)) ?? null
    );
  }

  private coversDate(assignment: any, tripDate: Date): boolean {
    if (assignment.effectiveFrom.getTime() > tripDate.getTime()) return false;
    if (assignment.effectiveTo && assignment.effectiveTo.getTime() < tripDate.getTime())
      return false;
    if (assignment.weekdays?.length) {
      const isoWeekday = tripDate.getUTCDay() === 0 ? 7 : tripDate.getUTCDay();
      if (!assignment.weekdays.includes(isoWeekday)) return false;
    }
    return true;
  }

  private eventType(value: unknown): TripEventType {
    if (typeof value !== 'string' || !TRIP_EVENT_TYPES.includes(value as TripEventType)) {
      throw new ValidationError(`eventType must be one of ${TRIP_EVENT_TYPES.join(', ')}.`);
    }
    return value as TripEventType;
  }
}

function nullableId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return optionalString(value) ?? null;
}

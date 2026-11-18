import { Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError, ValidationError, uuidv7 } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { FleetAuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/request';
import { decimalString, optionalString, requiredString } from '../common/validation';

const ROUTE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
type RouteStatus = (typeof ROUTE_STATUSES)[number];

export interface CreateRouteInput {
  code?: unknown;
  name?: unknown;
  description?: unknown;
  estimatedDistanceKm?: unknown;
  status?: unknown;
}

export interface RouteStopInput {
  supplierId?: unknown;
  sequence?: unknown;
  expectedArrival?: unknown;
  notes?: unknown;
}

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FleetAuditService,
  ) {}

  async list(query: { status?: string; q?: string }) {
    const status = query.status ? this.status(query.status) : undefined;
    const q = query.q?.trim();
    return this.prisma.route.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { stops: { orderBy: { sequence: 'asc' } } },
      orderBy: { code: 'asc' },
    });
  }

  async get(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: {
        stops: { orderBy: { sequence: 'asc' } },
        assignments: {
          where: { status: 'ACTIVE' },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
    });
    if (!route) throw new NotFoundError('Route not found.');
    return route;
  }

  async create(input: CreateRouteInput, context: RequestContext) {
    const code = requiredString(input.code, 'code').toUpperCase();
    const duplicate = await this.prisma.route.findUnique({ where: { code } });
    if (duplicate) throw new ConflictError('A route with that code already exists.');

    const route = await this.prisma.route.create({
      data: {
        code,
        name: requiredString(input.name, 'name'),
        description: optionalString(input.description),
        estimatedDistanceKm: decimalString(input.estimatedDistanceKm, 'estimatedDistanceKm', false),
        status: input.status ? this.status(input.status) : undefined,
      },
      include: { stops: true },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'route.created',
      entityType: 'Route',
      entityId: route.id,
      metadata: { code },
      ip: context.ip,
    });
    return route;
  }

  async update(id: string, input: CreateRouteInput, context: RequestContext) {
    const existing = await this.prisma.route.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Route not found.');

    const data: any = { version: { increment: 1 } };
    if ('code' in input) {
      const code = requiredString(input.code, 'code').toUpperCase();
      if (code !== existing.code) {
        const duplicate = await this.prisma.route.findUnique({ where: { code } });
        if (duplicate) throw new ConflictError('A route with that code already exists.');
      }
      data.code = code;
    }
    if ('name' in input) data.name = requiredString(input.name, 'name');
    if ('description' in input) {
      data.description = input.description ? (optionalString(input.description) ?? null) : null;
    }
    if ('estimatedDistanceKm' in input) {
      data.estimatedDistanceKm =
        decimalString(input.estimatedDistanceKm, 'estimatedDistanceKm', false) ?? null;
    }
    if ('status' in input) data.status = this.status(input.status);

    const route = await this.prisma.route.update({
      where: { id },
      data,
      include: { stops: { orderBy: { sequence: 'asc' } } },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'route.updated',
      entityType: 'Route',
      entityId: id,
      metadata: { fields: Object.keys(data) },
      ip: context.ip,
    });
    return route;
  }

  async replaceStops(id: string, stopsInput: RouteStopInput[], context: RequestContext) {
    await this.requireRoute(id);
    if (!Array.isArray(stopsInput)) throw new ValidationError('stops must be an array.');
    const stops = stopsInput.map((input) => {
      const sequence = Number(input.sequence);
      if (!Number.isInteger(sequence) || sequence <= 0) {
        throw new ValidationError('Each stop sequence must be a positive whole number.');
      }
      const supplierId = requiredString(input.supplierId, 'supplierId');
      const expectedArrival = optionalString(input.expectedArrival);
      if (expectedArrival && !/^\d{2}:\d{2}$/.test(expectedArrival)) {
        throw new ValidationError('expectedArrival must use HH:MM.');
      }
      return {
        supplierId,
        sequence,
        expectedArrival,
        notes: optionalString(input.notes),
      };
    });
    const sequences = new Set(stops.map((stop) => stop.sequence));
    const suppliers = new Set(stops.map((stop) => stop.supplierId));
    if (sequences.size !== stops.length) throw new ConflictError('Stop sequences must be unique.');
    if (suppliers.size !== stops.length) {
      throw new ConflictError('A supplier can appear only once on a route.');
    }

    const route = await this.prisma.$transaction(async (tx: any) => {
      await tx.routeStop.deleteMany({ where: { routeId: id } });
      for (const stop of stops) {
        await tx.routeStop.create({
          data: { id: uuidv7(), routeId: id, ...stop },
        });
      }
      return tx.route.update({
        where: { id },
        data: { version: { increment: 1 } },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      });
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'route.stops.replaced',
      entityType: 'Route',
      entityId: id,
      metadata: { stopCount: stops.length, supplierIds: stops.map((stop) => stop.supplierId) },
      ip: context.ip,
    });
    return route;
  }

  private status(value: unknown): RouteStatus {
    if (typeof value !== 'string' || !ROUTE_STATUSES.includes(value as RouteStatus)) {
      throw new ValidationError(`status must be one of ${ROUTE_STATUSES.join(', ')}.`);
    }
    return value as RouteStatus;
  }

  private async requireRoute(id: string) {
    const route = await this.prisma.route.findUnique({ where: { id } });
    if (!route) throw new NotFoundError('Route not found.');
    return route;
  }
}

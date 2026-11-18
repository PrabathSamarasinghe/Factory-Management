import { Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError, ValidationError } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { FleetAuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/request';
import {
  dateOnly,
  daysBetween,
  decimalString,
  decimalText,
  optionalDateOnly,
  optionalPositiveInt,
  optionalString,
  requiredString,
  todayDateOnly,
} from '../common/validation';

const LORRY_STATUSES = ['ACTIVE', 'MAINTENANCE', 'RETIRED'] as const;
type LorryStatus = (typeof LORRY_STATUSES)[number];

export interface LorryListQuery {
  status?: string;
  q?: string;
}

export interface CreateLorryInput {
  registrationNo?: unknown;
  make?: unknown;
  model?: unknown;
  year?: unknown;
  chassisNo?: unknown;
  engineNo?: unknown;
  fuelType?: unknown;
  capacityKg?: unknown;
  tareWeightKg?: unknown;
  colour?: unknown;
  photoObjectKey?: unknown;
  insuranceExpiry?: unknown;
  revenueLicenceExpiry?: unknown;
  emissionTestExpiry?: unknown;
  currentOdometerKm?: unknown;
  status?: unknown;
}

export interface UpdateLorryInput extends CreateLorryInput {}

export interface CreateDocumentInput {
  docType?: unknown;
  objectKey?: unknown;
  issuedOn?: unknown;
  expiresOn?: unknown;
}

export interface CreateMaintenanceInput {
  serviceDate?: unknown;
  odometerKm?: unknown;
  description?: unknown;
  cost?: unknown;
  vendor?: unknown;
  nextDueKm?: unknown;
  nextDueDate?: unknown;
}

@Injectable()
export class LorriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FleetAuditService,
  ) {}

  async list(query: LorryListQuery) {
    const status = query.status ? this.status(query.status) : undefined;
    const q = query.q?.trim();
    return this.prisma.lorry.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { registrationNo: { contains: q, mode: 'insensitive' } },
                { make: { contains: q, mode: 'insensitive' } },
                { model: { contains: q, mode: 'insensitive' } },
                { chassisNo: { contains: q, mode: 'insensitive' } },
                { engineNo: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { registrationNo: 'asc' },
    });
  }

  async get(id: string) {
    const lorry = await this.prisma.lorry.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { expiresOn: 'desc' } },
        maintenance: { orderBy: { serviceDate: 'desc' } },
      },
    });
    if (!lorry) throw new NotFoundError('Lorry not found.');
    return lorry;
  }

  async create(input: CreateLorryInput, context: RequestContext) {
    const registrationNo = requiredString(input.registrationNo, 'registrationNo').toUpperCase();
    const duplicate = await this.prisma.lorry.findUnique({ where: { registrationNo } });
    if (duplicate) throw new ConflictError('A lorry with that registration number already exists.');

    const lorry = await this.prisma.lorry.create({
      data: {
        registrationNo,
        make: requiredString(input.make, 'make'),
        model: requiredString(input.model, 'model'),
        year: optionalPositiveInt(input.year, 'year'),
        chassisNo: optionalString(input.chassisNo),
        engineNo: optionalString(input.engineNo),
        fuelType: optionalString(input.fuelType),
        capacityKg: decimalString(input.capacityKg, 'capacityKg', false),
        tareWeightKg: decimalString(input.tareWeightKg, 'tareWeightKg', false),
        colour: optionalString(input.colour),
        photoObjectKey: optionalString(input.photoObjectKey),
        insuranceExpiry: optionalDateOnly(input.insuranceExpiry, 'insuranceExpiry'),
        revenueLicenceExpiry: optionalDateOnly(input.revenueLicenceExpiry, 'revenueLicenceExpiry'),
        emissionTestExpiry: optionalDateOnly(input.emissionTestExpiry, 'emissionTestExpiry'),
        currentOdometerKm: decimalString(input.currentOdometerKm, 'currentOdometerKm', false),
        status: input.status ? this.status(input.status) : undefined,
      },
    });

    await this.audit.record({
      actorId: context.actorId,
      action: 'lorry.created',
      entityType: 'Lorry',
      entityId: lorry.id,
      metadata: { registrationNo },
      ip: context.ip,
    });
    return lorry;
  }

  async update(id: string, input: UpdateLorryInput, context: RequestContext) {
    const existing = await this.prisma.lorry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Lorry not found.');

    const data: Record<string, unknown> = {};
    if ('registrationNo' in input) {
      const registrationNo = requiredString(input.registrationNo, 'registrationNo').toUpperCase();
      if (registrationNo !== existing.registrationNo) {
        const duplicate = await this.prisma.lorry.findUnique({ where: { registrationNo } });
        if (duplicate) {
          throw new ConflictError('A lorry with that registration number already exists.');
        }
      }
      data.registrationNo = registrationNo;
    }
    if ('make' in input) data.make = requiredString(input.make, 'make');
    if ('model' in input) data.model = requiredString(input.model, 'model');
    if ('year' in input) data.year = nullablePositiveInt(input.year, 'year');
    for (const field of [
      'chassisNo',
      'engineNo',
      'fuelType',
      'colour',
      'photoObjectKey',
    ] as const) {
      if (field in input) data[field] = nullableString(input[field]);
    }
    if ('capacityKg' in input) {
      data.capacityKg = decimalString(input.capacityKg, 'capacityKg', false) ?? null;
    }
    if ('tareWeightKg' in input) {
      data.tareWeightKg = decimalString(input.tareWeightKg, 'tareWeightKg', false) ?? null;
    }
    for (const field of [
      'insuranceExpiry',
      'revenueLicenceExpiry',
      'emissionTestExpiry',
    ] as const) {
      if (field in input) {
        data[field] = input[field] ? dateOnly(input[field], field) : null;
      }
    }
    if ('currentOdometerKm' in input) {
      data.currentOdometerKm = decimalString(input.currentOdometerKm, 'currentOdometerKm');
    }
    if ('status' in input) data.status = this.status(input.status);
    data.version = { increment: 1 };

    const lorry = await this.prisma.lorry.update({ where: { id }, data });
    await this.audit.record({
      actorId: context.actorId,
      action: 'lorry.updated',
      entityType: 'Lorry',
      entityId: id,
      metadata: { fields: Object.keys(data) },
      ip: context.ip,
    });
    return lorry;
  }

  async addDocument(id: string, input: CreateDocumentInput, context: RequestContext) {
    await this.requireLorry(id);
    const document = await this.prisma.lorryDocument.create({
      data: {
        lorryId: id,
        docType: requiredString(input.docType, 'docType'),
        objectKey: requiredString(input.objectKey, 'objectKey'),
        issuedOn: optionalDateOnly(input.issuedOn, 'issuedOn'),
        expiresOn: optionalDateOnly(input.expiresOn, 'expiresOn'),
        uploadedBy: context.actorId,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'lorry.document.added',
      entityType: 'Lorry',
      entityId: id,
      metadata: { documentId: document.id, docType: document.docType },
      ip: context.ip,
    });
    return document;
  }

  async addMaintenance(id: string, input: CreateMaintenanceInput, context: RequestContext) {
    await this.requireLorry(id);
    const maintenance = await this.prisma.lorryMaintenance.create({
      data: {
        lorryId: id,
        serviceDate: dateOnly(input.serviceDate, 'serviceDate'),
        odometerKm: decimalString(input.odometerKm, 'odometerKm'),
        description: requiredString(input.description, 'description'),
        cost: decimalString(input.cost, 'cost', false),
        vendor: optionalString(input.vendor),
        nextDueKm: decimalString(input.nextDueKm, 'nextDueKm', false),
        nextDueDate: optionalDateOnly(input.nextDueDate, 'nextDueDate'),
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'lorry.maintenance.added',
      entityType: 'Lorry',
      entityId: id,
      metadata: { maintenanceId: maintenance.id },
      ip: context.ip,
    });
    return maintenance;
  }

  async alerts(now = new Date()) {
    const days = Number(process.env.FLEET_ALERT_DAYS ?? 30);
    const km = Number(process.env.FLEET_ALERT_KM ?? 1000);
    const today = todayDateOnly(now);
    const [lorries, maintenance] = await Promise.all([
      this.prisma.lorry.findMany({ where: { status: { not: 'RETIRED' } } }),
      this.prisma.lorryMaintenance.findMany({
        where: {
          OR: [{ nextDueDate: { not: null } }, { nextDueKm: { not: null } }],
        },
        orderBy: { serviceDate: 'desc' },
      }),
    ]);
    const byId = new Map(lorries.map((lorry: any) => [lorry.id, lorry]));
    const alerts: any[] = [];

    for (const lorry of lorries as any[]) {
      for (const [field, kind] of [
        ['insuranceExpiry', 'INSURANCE'],
        ['revenueLicenceExpiry', 'REVENUE_LICENCE'],
        ['emissionTestExpiry', 'EMISSION_TEST'],
      ] as const) {
        const due = lorry[field] as Date | null;
        if (!due) continue;
        const daysRemaining = daysBetween(today, due);
        if (daysRemaining > days) continue;
        alerts.push({
          lorryId: lorry.id,
          registrationNo: lorry.registrationNo,
          kind,
          dueDate: due.toISOString().slice(0, 10),
          daysRemaining,
          severity: daysRemaining < 0 ? 'OVERDUE' : 'DUE_SOON',
        });
      }
    }

    for (const row of maintenance as any[]) {
      const lorry = byId.get(row.lorryId) as any;
      if (!lorry) continue;
      if (row.nextDueDate) {
        const daysRemaining = daysBetween(today, row.nextDueDate);
        if (daysRemaining <= days) {
          alerts.push({
            lorryId: lorry.id,
            registrationNo: lorry.registrationNo,
            kind: 'MAINTENANCE_DATE',
            dueDate: row.nextDueDate.toISOString().slice(0, 10),
            daysRemaining,
            severity: daysRemaining < 0 ? 'OVERDUE' : 'DUE_SOON',
          });
        }
      }
      if (row.nextDueKm) {
        const kmRemaining = Number(row.nextDueKm) - Number(lorry.currentOdometerKm);
        if (kmRemaining <= km) {
          alerts.push({
            lorryId: lorry.id,
            registrationNo: lorry.registrationNo,
            kind: 'MAINTENANCE_KM',
            dueOdometerKm: decimalText(row.nextDueKm),
            currentOdometerKm: decimalText(lorry.currentOdometerKm),
            kmRemaining,
            severity: kmRemaining < 0 ? 'OVERDUE' : 'DUE_SOON',
          });
        }
      }
    }

    const severityRank: Record<string, number> = { OVERDUE: 0, DUE_SOON: 1 };
    alerts.sort(
      (left, right) =>
        (severityRank[left.severity] ?? 2) - (severityRank[right.severity] ?? 2) ||
        String(left.dueDate ?? '9999-12-31').localeCompare(String(right.dueDate ?? '9999-12-31')),
    );
    return {
      asOf: now.toISOString(),
      thresholds: { days, km },
      alerts,
    };
  }

  private status(value: unknown): LorryStatus {
    if (typeof value !== 'string' || !LORRY_STATUSES.includes(value as LorryStatus)) {
      throw new ValidationError(`status must be one of ${LORRY_STATUSES.join(', ')}.`);
    }
    return value as LorryStatus;
  }

  private async requireLorry(id: string) {
    const lorry = await this.prisma.lorry.findUnique({ where: { id } });
    if (!lorry) throw new NotFoundError('Lorry not found.');
    return lorry;
  }
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return optionalString(value) ?? null;
}

function nullablePositiveInt(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  return optionalPositiveInt(value, label) ?? null;
}

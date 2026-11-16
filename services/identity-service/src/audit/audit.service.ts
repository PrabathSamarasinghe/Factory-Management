import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ListAuditLogsQuery {
  event?: string;
  userId?: string;
  success?: boolean;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(query: ListAuditLogsQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 200) : 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.event) {
      where.event = query.event;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.success !== undefined) {
      where.success = query.success;
    }
    if (query.from || query.to) {
      where.at = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.authAudit.count({ where }),
      this.prisma.authAudit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { at: 'desc' },
        select: {
          id: true,
          userId: true,
          event: true,
          ip: true,
          deviceId: true,
          success: true,
          at: true,
          user: {
            select: { id: true, username: true, email: true },
          },
        },
      }),
    ]);

    return {
      data,
      page: {
        current: page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listEventTypes() {
    const rows = await this.prisma.authAudit.findMany({
      distinct: ['event'],
      select: { event: true },
      orderBy: { event: 'asc' },
    });
    return rows.map((row) => row.event);
  }
}

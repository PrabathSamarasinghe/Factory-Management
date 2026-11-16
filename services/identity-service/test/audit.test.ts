import { beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.service';

describe('AuditService', () => {
  let auditService: AuditService;
  let mockPrisma: any;
  let lastFindManyArgs: any;

  beforeEach(() => {
    lastFindManyArgs = undefined;
    mockPrisma = {
      authAudit: {
        count: async () => 3,
        findMany: async (args: any) => {
          lastFindManyArgs = args;
          return [];
        },
      },
    };
    auditService = new AuditService(mockPrisma as any);
  });

  it('applies filters, clamps the limit and paginates', async () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-02-01T00:00:00.000Z';

    const result = await auditService.listAuditLogs({
      event: 'LOGIN_SUCCESS',
      userId: 'user-1',
      success: true,
      from,
      to,
      page: 3,
      limit: 500,
    });

    expect(lastFindManyArgs.where).toEqual({
      event: 'LOGIN_SUCCESS',
      userId: 'user-1',
      success: true,
      at: { gte: new Date(from), lte: new Date(to) },
    });
    expect(lastFindManyArgs.skip).toBe(400);
    expect(lastFindManyArgs.take).toBe(200);
    expect(lastFindManyArgs.orderBy).toEqual({ at: 'desc' });
    expect(result.page).toEqual({ current: 3, limit: 200, total: 3, totalPages: 1 });
  });

  it('uses safe defaults for missing pagination', async () => {
    await auditService.listAuditLogs({});

    expect(lastFindManyArgs.where).toEqual({});
    expect(lastFindManyArgs.skip).toBe(0);
    expect(lastFindManyArgs.take).toBe(50);
  });

  it('only filters by success when it is explicitly provided', async () => {
    await auditService.listAuditLogs({ success: false });
    expect(lastFindManyArgs.where).toEqual({ success: false });

    await auditService.listAuditLogs({ success: undefined });
    expect(lastFindManyArgs.where).toEqual({});
  });

  it('lists distinct event types in order', async () => {
    mockPrisma.authAudit.findMany = async (args: any) => {
      lastFindManyArgs = args;
      return [{ event: 'LOGIN_FAILED' }, { event: 'LOGIN_SUCCESS' }];
    };

    const events = await auditService.listEventTypes();

    expect(lastFindManyArgs).toEqual({
      distinct: ['event'],
      select: { event: true },
      orderBy: { event: 'asc' },
    });
    expect(events).toEqual(['LOGIN_FAILED', 'LOGIN_SUCCESS']);
  });
});

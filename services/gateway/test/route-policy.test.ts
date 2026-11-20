import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '@galatura/platform-kit';
import { RoutePolicyService } from '../src/middleware/route-policy.service';

describe('RoutePolicyService (Tasks 1.5 & 1.8 - C7 Lockdown)', () => {
  const policy = new RoutePolicyService();

  it('identifies public endpoints correctly', () => {
    expect(policy.isPublicPath('/healthz')).toBe(true);
    expect(policy.isPublicPath('/.well-known/jwks.json')).toBe(true);
    expect(policy.isPublicPath('/api/v1/identity/auth/login')).toBe(true);
    expect(policy.isPublicPath('/api/v1/identity/auth/refresh')).toBe(true);
    expect(policy.isPublicPath('/api/v1/users')).toBe(false);
  });

  it('allows C7 Monitor app to access monitor routes and websocket feeds', () => {
    expect(() => policy.evaluatePolicy('/api/v1/monitor/dashboard', 'C7')).not.toThrow();

    expect(() => policy.evaluatePolicy('/ws', 'C7')).not.toThrow();

    expect(() => policy.evaluatePolicy('/healthz', 'C7')).not.toThrow();
  });

  it('blocks C7 Monitor app from accessing non-monitor routes with ForbiddenError', () => {
    expect(() => policy.evaluatePolicy('/api/v1/identity/users', 'C7')).toThrow(ForbiddenError);

    expect(() => policy.evaluatePolicy('/api/v1/accounts/ledgers', 'C7')).toThrow(ForbiddenError);

    expect(() => policy.evaluatePolicy('/api/v1/collection/weighings', 'C7')).toThrow(
      ForbiddenError,
    );
  });

  it('allows C5 Accounts app to access accounts routes while C7 remains blocked', () => {
    const accountantPrincipal: any = {
      subject: 'accountant-123',
      roles: ['ACCOUNTANT'],
      permissions: ['coa:read', 'ledger:read', 'report:read'],
      permissionsVersion: 1,
      scope: 'ALL',
      audience: 'galatura-services',
    };

    expect(() =>
      policy.evaluatePolicy('/api/v1/accounts', 'C5', accountantPrincipal),
    ).not.toThrow();
    expect(() =>
      policy.evaluatePolicy('/api/v1/accounts/accounts/tree', 'C5', accountantPrincipal),
    ).not.toThrow();
    expect(() => policy.evaluatePolicy('/api/v1/accounts/journal-entries', 'C5')).not.toThrow();

    expect(() => policy.evaluatePolicy('/api/v1/accounts', 'C7')).toThrow(ForbiddenError);
    expect(() =>
      policy.evaluatePolicy('/api/v1/accounts/accounts/tree', 'C7', accountantPrincipal),
    ).toThrow(ForbiddenError);
  });

  it('blocks principal having MONITOR role from accessing non-monitor routes', () => {
    const monitorPrincipal: any = {
      subject: 'user-123',
      roles: ['MONITOR'],
      permissions: ['monitor:read'],
      permissionsVersion: 1,
      scope: 'ALL',
      audience: 'galatura-services',
    };

    expect(() =>
      policy.evaluatePolicy('/api/v1/accounts/ledgers', undefined, monitorPrincipal),
    ).toThrow(ForbiddenError);
  });

  it('allows C3, collection mobile and C4 clients to access collection routes', () => {
    expect(() => policy.evaluatePolicy('/api/v1/collection/pickups', 'C3')).not.toThrow();
    expect(() =>
      policy.evaluatePolicy('/api/v1/collection/sync/push', 'COLLECTION_MOBILE'),
    ).not.toThrow();
    expect(() => policy.evaluatePolicy('/api/v1/collection/weighings', 'C4')).not.toThrow();
  });

  it('allows C4 clients to access notification status routes', () => {
    expect(() => policy.evaluatePolicy('/api/v1/notification/sms', 'C4')).not.toThrow();
    expect(() => policy.evaluatePolicy('/api/v1/notification/templates', undefined)).not.toThrow();
    expect(() => policy.evaluatePolicy('/api/v1/notification/sms', 'C7')).toThrow(ForbiddenError);
  });

  it('allows non-C7 clients (e.g. C1 / Admin) to access standard routes', () => {
    const adminPrincipal: any = {
      subject: 'admin-123',
      roles: ['ADMIN'],
      permissions: ['user:read'],
      permissionsVersion: 1,
      scope: 'ALL',
      audience: 'galatura-services',
    };

    expect(() => policy.evaluatePolicy('/api/v1/users', 'C1', adminPrincipal)).not.toThrow();
  });
});

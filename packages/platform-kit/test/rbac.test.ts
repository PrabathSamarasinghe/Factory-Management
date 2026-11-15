import { describe, expect, it } from 'vitest';
import {
  ForbiddenError,
  InMemoryPermissionCache,
  RbacService,
  assertScope,
  hasScope,
  type Principal,
  type PermissionResolver,
} from '../src';

class MapResolver implements PermissionResolver {
  calls = 0;

  constructor(private readonly permissions: string[]) {}

  async resolve(): Promise<string[]> {
    this.calls += 1;
    return [...this.permissions];
  }
}

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    subject: 'user-1',
    roles: ['SUPERVISOR'],
    permissions: [],
    permissionsVersion: 1,
    scope: 'OWN',
    audience: 'galatura-api',
    ...overrides,
  };
}

describe('RbacService', () => {
  it('uses permissions embedded in the token without resolving', async () => {
    const resolver = new MapResolver(['collection:read']);
    const rbac = new RbacService(new InMemoryPermissionCache(), resolver);

    await expect(
      rbac.can(principal({ permissions: ['collection:read'] }), 'collection:read'),
    ).resolves.toBe(true);
    expect(resolver.calls).toBe(0);
  });

  it('resolves once and caches by permissions version', async () => {
    const resolver = new MapResolver(['collection:read', 'collection:write']);
    const rbac = new RbacService(new InMemoryPermissionCache(), resolver);

    await expect(rbac.can(principal(), ['collection:read', 'collection:write'])).resolves.toBe(
      true,
    );
    await expect(rbac.can(principal(), 'collection:read')).resolves.toBe(true);
    expect(resolver.calls).toBe(1);

    await expect(rbac.can(principal({ permissionsVersion: 2 }), 'collection:read')).resolves.toBe(
      true,
    );
    expect(resolver.calls).toBe(2);
  });

  it('re-resolves after invalidation or cache expiry', async () => {
    let now = 0;
    const cache = new InMemoryPermissionCache(1_000, () => now);
    const resolver = new MapResolver(['collection:read']);
    const rbac = new RbacService(cache, resolver);

    await rbac.permissionsFor(principal());
    now = 1_001;
    await rbac.permissionsFor(principal());
    expect(resolver.calls).toBe(2);

    await cache.invalidate('user-1');
    await rbac.permissionsFor(principal());
    expect(resolver.calls).toBe(3);
  });

  it('denies when a required permission is missing', async () => {
    const rbac = new RbacService(
      new InMemoryPermissionCache(),
      new MapResolver(['collection:read']),
    );

    await expect(rbac.can(principal(), ['collection:read', 'collection:finalize'])).resolves.toBe(
      false,
    );
    const error = await rbac
      .assert(principal(), ['collection:read', 'collection:finalize'])
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).details).toMatchObject({
      missing: ['collection:finalize'],
    });
  });

  it('denies empty permission requests by default', async () => {
    const rbac = new RbacService(new InMemoryPermissionCache(), new MapResolver([]));
    await expect(rbac.can(principal(), [])).resolves.toBe(false);
  });
});

describe('data scope', () => {
  it('orders scopes from narrowest to widest', () => {
    expect(hasScope(principal({ scope: 'OWN' }), 'OWN')).toBe(true);
    expect(hasScope(principal({ scope: 'OWN' }), 'ROUTE')).toBe(false);
    expect(hasScope(principal({ scope: 'DEPARTMENT' }), 'ROUTE')).toBe(true);
    expect(hasScope(principal({ scope: 'ALL' }), 'DEPARTMENT')).toBe(true);
  });

  it('throws when the scope is too narrow', () => {
    expect(() => assertScope(principal({ scope: 'OWN' }), 'ROUTE')).toThrow(ForbiddenError);
    expect(() => assertScope(principal({ scope: 'ROUTE' }), 'ROUTE')).not.toThrow();
  });
});

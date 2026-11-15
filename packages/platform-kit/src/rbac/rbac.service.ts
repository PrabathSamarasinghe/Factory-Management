import { ForbiddenError } from '../errors';
import type { Principal } from '../types';

export interface PermissionCache {
  get(userId: string, permissionsVersion: number): Promise<string[] | null>;
  set(userId: string, permissionsVersion: number, permissions: string[]): Promise<void>;
  invalidate(userId: string): Promise<void>;
}

export interface PermissionResolver {
  resolve(userId: string): Promise<string[]>;
}

export class RbacService {
  constructor(
    private readonly cache: PermissionCache,
    private readonly resolver: PermissionResolver,
  ) {}

  async permissionsFor(principal: Principal): Promise<Set<string>> {
    if (principal.permissions.length > 0) {
      return new Set(principal.permissions);
    }

    const cached = await this.cache.get(principal.subject, principal.permissionsVersion);
    if (cached) {
      return new Set(cached);
    }

    const permissions = await this.resolver.resolve(principal.subject);
    await this.cache.set(principal.subject, principal.permissionsVersion, permissions);
    return new Set(permissions);
  }

  async can(principal: Principal, required: string | string[]): Promise<boolean> {
    const requiredList = Array.isArray(required) ? required : [required];
    if (requiredList.length === 0) {
      return false;
    }
    const permissions = await this.permissionsFor(principal);
    return requiredList.every((permission) => permissions.has(permission));
  }

  async assert(principal: Principal, required: string | string[]): Promise<void> {
    if (await this.can(principal, required)) {
      return;
    }

    const requiredList = Array.isArray(required) ? required : [required];
    const permissions = await this.permissionsFor(principal);
    const missing = requiredList.filter((permission) => !permissions.has(permission));
    throw new ForbiddenError('You do not have permission to perform this action.', {
      details: { required: requiredList, missing },
    });
  }
}

export class InMemoryPermissionCache implements PermissionCache {
  private readonly entries = new Map<
    string,
    { permissions: string[]; version: number; expiresAt: number }
  >();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly clock: () => number = Date.now,
  ) {}

  async get(userId: string, permissionsVersion: number): Promise<string[] | null> {
    const entry = this.entries.get(userId);
    if (!entry) {
      return null;
    }
    if (entry.version !== permissionsVersion || entry.expiresAt <= this.clock()) {
      this.entries.delete(userId);
      return null;
    }
    return [...entry.permissions];
  }

  async set(userId: string, permissionsVersion: number, permissions: string[]): Promise<void> {
    this.entries.set(userId, {
      permissions: [...permissions],
      version: permissionsVersion,
      expiresAt: this.clock() + this.ttlMs,
    });
  }

  async invalidate(userId: string): Promise<void> {
    this.entries.delete(userId);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

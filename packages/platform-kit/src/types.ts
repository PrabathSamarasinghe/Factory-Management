/** Data scope attached to a principal. Ordered from narrowest to widest. */
export type DataScope = 'OWN' | 'ROUTE' | 'DEPARTMENT' | 'ALL';

export const DATA_SCOPES: readonly DataScope[] = ['OWN', 'ROUTE', 'DEPARTMENT', 'ALL'];

export function isDataScope(value: unknown): value is DataScope {
  return typeof value === 'string' && (DATA_SCOPES as readonly string[]).includes(value);
}

export type ActorType = 'USER' | 'SERVICE' | 'SYSTEM' | 'DEVICE';

export const ACTOR_TYPES: readonly ActorType[] = ['USER', 'SERVICE', 'SYSTEM', 'DEVICE'];

export function isActorType(value: unknown): value is ActorType {
  return typeof value === 'string' && (ACTOR_TYPES as readonly string[]).includes(value);
}

/** Authenticated human/device principal extracted from an access token. */
export interface Principal {
  subject: string;
  roles: string[];
  /** Permissions embedded in the token, if any. Normally the full set is resolved server-side. */
  permissions: string[];
  /** Version of the permission set; a token with an older version is re-resolved. */
  permissionsVersion: number;
  scope: DataScope;
  audience: string | string[];
  tokenId?: string;
  expiresAt?: number;
  raw?: Record<string, unknown>;
}

/** Authenticated service-to-service principal. */
export interface ServicePrincipal {
  subject: string;
  scopes: string[];
  audience: string | string[];
  expiresAt?: number;
  raw?: Record<string, unknown>;
}

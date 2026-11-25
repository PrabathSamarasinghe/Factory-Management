import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '@galatura/platform-kit';
import { assertPermission, readPermissions } from '../src/common/request';

function requestWith(permissions: unknown): any {
  return { headers: { 'x-permissions': JSON.stringify(permissions) } };
}

describe('people request permissions', () => {
  it('reads gateway permissions and denies missing permissions', () => {
    expect(readPermissions(requestWith(['document:write']))).toEqual(['document:write']);
    expect(() => assertPermission(requestWith(['document:read']), 'document:write')).toThrow(
      ForbiddenError,
    );
  });

  it('allows a caller with the required permission', () => {
    expect(() =>
      assertPermission(requestWith(['document:read', 'document:write']), 'document:write'),
    ).not.toThrow();
  });
});

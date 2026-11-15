import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ForbiddenError, UnauthorizedError } from '../errors';
import type { Principal } from '../types';
import { IS_PUBLIC_KEY, REQUIRED_PERMISSIONS_KEY } from './decorators';
import type { RbacService } from './rbac.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly rbac: RbacService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();

    const isPublic =
      Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, controller);
    if (isPublic) {
      return true;
    }

    const required = (Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler) ??
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controller)) as string[] | undefined;

    if (!required || required.length === 0) {
      throw new ForbiddenError('Access denied by default.');
    }

    const request = context.switchToHttp().getRequest<{ principal?: Principal }>();
    if (!request.principal) {
      throw new UnauthorizedError('Authentication required.');
    }

    await this.rbac.assert(request.principal, required);
    return true;
  }
}

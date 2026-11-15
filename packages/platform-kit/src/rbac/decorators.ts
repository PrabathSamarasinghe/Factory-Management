import 'reflect-metadata';
import { DATA_SCOPES, type DataScope, type Principal } from '../types';
import { ForbiddenError } from '../errors';

export const REQUIRED_PERMISSIONS_KEY = 'platform-kit:requiredPermissions';
export const IS_PUBLIC_KEY = 'platform-kit:isPublic';

export function RequirePermission(...permissions: string[]): MethodDecorator & ClassDecorator {
  return ((target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(REQUIRED_PERMISSIONS_KEY, permissions, descriptor.value as object);
    } else {
      Reflect.defineMetadata(REQUIRED_PERMISSIONS_KEY, permissions, target);
    }
  }) as MethodDecorator & ClassDecorator;
}

export function Public(): MethodDecorator & ClassDecorator {
  return ((target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, descriptor.value as object);
    } else {
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
    }
  }) as MethodDecorator & ClassDecorator;
}

export function hasScope(principal: Principal, required: DataScope): boolean {
  return DATA_SCOPES.indexOf(principal.scope) >= DATA_SCOPES.indexOf(required);
}

export function assertScope(principal: Principal, required: DataScope): void {
  if (!hasScope(principal, required)) {
    throw new ForbiddenError('Outside the permitted data scope.', {
      details: { requiredScope: required, actualScope: principal.scope },
    });
  }
}

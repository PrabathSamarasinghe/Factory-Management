export {
  AppError,
  ErrorCodes,
  ValidationError,
  UnauthorizedError,
  InvalidTokenError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  IdempotencyKeyReusedError,
  PreconditionFailedError,
  RateLimitedError,
  DependencyUnavailableError,
  InternalError,
  BusinessRuleError,
  NotImplementedError,
  isAppError,
} from './app-error';
export type { AppErrorOptions, ErrorCode } from './app-error';
export { toErrorEnvelope } from './envelope';
export type { ErrorBody, ErrorEnvelope } from './envelope';
export { AppExceptionFilter, toAppError } from './nest-exception.filter';

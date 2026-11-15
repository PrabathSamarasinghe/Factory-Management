export const ErrorCodes = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  PERIOD_LOCKED: 'PERIOD_LOCKED',
  UNBALANCED_ENTRY: 'UNBALANCED_ENTRY',
  TRIP_NOT_ENDABLE: 'TRIP_NOT_ENDABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

const DEFAULT_STATUS: Record<string, number> = {
  [ErrorCodes.BAD_REQUEST]: 400,
  [ErrorCodes.UNAUTHENTICATED]: 401,
  [ErrorCodes.INVALID_TOKEN]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.CONFLICT]: 409,
  [ErrorCodes.VERSION_CONFLICT]: 409,
  [ErrorCodes.IDEMPOTENCY_KEY_REUSED]: 409,
  [ErrorCodes.PRECONDITION_FAILED]: 412,
  [ErrorCodes.PAYLOAD_TOO_LARGE]: 413,
  [ErrorCodes.UNSUPPORTED_MEDIA_TYPE]: 415,
  [ErrorCodes.VALIDATION_FAILED]: 422,
  [ErrorCodes.BUSINESS_RULE_VIOLATION]: 422,
  [ErrorCodes.PERIOD_LOCKED]: 409,
  [ErrorCodes.UNBALANCED_ENTRY]: 422,
  [ErrorCodes.TRIP_NOT_ENDABLE]: 409,
  [ErrorCodes.RATE_LIMITED]: 429,
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.NOT_IMPLEMENTED]: 501,
  [ErrorCodes.DEPENDENCY_UNAVAILABLE]: 503,
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
  [ErrorCodes.UPSTREAM_TIMEOUT]: 504,
};

export interface AppErrorOptions {
  httpStatus?: number;
  details?: unknown;
  retryable?: boolean;
  /** When false the client receives a generic message and no details. */
  expose?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: unknown;
  readonly retryable: boolean;
  readonly expose: boolean;

  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = options.httpStatus ?? DEFAULT_STATUS[code] ?? 500;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
    this.expose = options.expose ?? true;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed.', details?: unknown, options: AppErrorOptions = {}) {
    super(ErrorCodes.VALIDATION_FAILED, message, { details, ...options });
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.', options: AppErrorOptions = {}) {
    super(ErrorCodes.UNAUTHENTICATED, message, { ...options });
    this.name = 'UnauthorizedError';
  }
}

export class InvalidTokenError extends AppError {
  constructor(message = 'Invalid or expired token.', options: AppErrorOptions = {}) {
    super(ErrorCodes.INVALID_TOKEN, message, { ...options });
    this.name = 'InvalidTokenError';
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'You do not have permission to perform this action.',
    options: AppErrorOptions = {},
  ) {
    super(ErrorCodes.FORBIDDEN, message, { ...options });
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.', options: AppErrorOptions = {}) {
    super(ErrorCodes.NOT_FOUND, message, { ...options });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(
    message = 'The request conflicts with the current state.',
    options: AppErrorOptions = {},
  ) {
    super(ErrorCodes.CONFLICT, message, { ...options });
    this.name = 'ConflictError';
  }
}

export class IdempotencyKeyReusedError extends AppError {
  constructor(
    message = 'Idempotency-Key was reused with a different request.',
    options: AppErrorOptions = {},
  ) {
    super(ErrorCodes.IDEMPOTENCY_KEY_REUSED, message, { ...options });
    this.name = 'IdempotencyKeyReusedError';
  }
}

export class PreconditionFailedError extends AppError {
  constructor(message = 'The precondition failed.', options: AppErrorOptions = {}) {
    super(ErrorCodes.PRECONDITION_FAILED, message, { ...options });
    this.name = 'PreconditionFailedError';
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests.', options: AppErrorOptions = {}) {
    super(ErrorCodes.RATE_LIMITED, message, { retryable: true, ...options });
    this.name = 'RateLimitedError';
  }
}

export class DependencyUnavailableError extends AppError {
  constructor(message = 'A required dependency is unavailable.', options: AppErrorOptions = {}) {
    super(ErrorCodes.DEPENDENCY_UNAVAILABLE, message, { retryable: true, ...options });
    this.name = 'DependencyUnavailableError';
  }
}

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred.', options: AppErrorOptions = {}) {
    super(ErrorCodes.INTERNAL_ERROR, message, { expose: false, ...options });
    this.name = 'InternalError';
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(ErrorCodes.BUSINESS_RULE_VIOLATION, message, { ...options });
    this.name = 'BusinessRuleError';
  }
}

export class NotImplementedError extends AppError {
  constructor(message = 'This feature is not implemented yet.', options: AppErrorOptions = {}) {
    super(ErrorCodes.NOT_IMPLEMENTED, message, { ...options });
    this.name = 'NotImplementedError';
  }
}

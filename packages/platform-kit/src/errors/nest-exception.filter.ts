import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { AppError, ErrorCodes } from './app-error';
import { toErrorEnvelope } from './envelope';
import type { Logger } from '../logging';
import { uuidv7 } from '../ids';

interface HttpRequestLike {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface HttpResponseLike {
  status(code: number): { json(body: unknown): void };
  setHeader?(name: string, value: string): void;
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger?: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequestLike>();
    const response = http.getResponse<HttpResponseLike>();

    const requestId = firstHeader(request.headers?.['x-request-id']) ?? uuidv7();
    const error = toAppError(exception);
    const envelope = toErrorEnvelope(error, requestId);

    response.setHeader?.('X-Request-Id', requestId);
    if (error.retryable) {
      response.setHeader?.('Retry-After', '5');
    }

    if (this.logger) {
      const level = error.httpStatus >= 500 ? 'error' : 'warn';
      this.logger[level]('http.request.failed', {
        requestId,
        method: request.method,
        route: request.url,
        status: error.httpStatus,
        errorCode: error.code,
      });
    }

    response.status(error.httpStatus).json(envelope);
  }
}

export function toAppError(exception: unknown): AppError {
  if (exception instanceof AppError) {
    return exception;
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const message =
      typeof raw === 'string'
        ? raw
        : typeof raw === 'object' && raw !== null
          ? extractMessage(raw as Record<string, unknown>)
          : exception.message;

    if (status === 400 && typeof raw === 'object' && raw !== null) {
      const rawMessage = (raw as { message?: unknown }).message;
      if (Array.isArray(rawMessage)) {
        return new AppError(ErrorCodes.VALIDATION_FAILED, 'One or more fields are invalid.', {
          httpStatus: 422,
          details: { messages: rawMessage },
          cause: exception,
        });
      }
    }

    return new AppError(codeForStatus(status), message, {
      httpStatus: status,
      retryable: status === 429 || status === 503 || status === 504,
      cause: exception,
    });
  }

  return new AppError(ErrorCodes.INTERNAL_ERROR, 'An unexpected error occurred.', {
    httpStatus: 500,
    expose: false,
    cause: exception,
  });
}

function extractMessage(raw: Record<string, unknown>): string {
  const message = raw.message;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message) && message.length > 0) {
    return String(message[0]);
  }
  return 'Request failed.';
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return ErrorCodes.BAD_REQUEST;
    case 401:
      return ErrorCodes.UNAUTHENTICATED;
    case 403:
      return ErrorCodes.FORBIDDEN;
    case 404:
      return ErrorCodes.NOT_FOUND;
    case 409:
      return ErrorCodes.CONFLICT;
    case 412:
      return ErrorCodes.PRECONDITION_FAILED;
    case 413:
      return ErrorCodes.PAYLOAD_TOO_LARGE;
    case 415:
      return ErrorCodes.UNSUPPORTED_MEDIA_TYPE;
    case 422:
      return ErrorCodes.VALIDATION_FAILED;
    case 429:
      return ErrorCodes.RATE_LIMITED;
    case 503:
      return ErrorCodes.SERVICE_UNAVAILABLE;
    case 504:
      return ErrorCodes.UPSTREAM_TIMEOUT;
    default:
      return ErrorCodes.INTERNAL_ERROR;
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

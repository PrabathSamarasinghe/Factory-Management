import { AppError, ErrorCodes } from './app-error';

export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
}

export interface ErrorEnvelope {
  error: ErrorBody;
}

const GENERIC_MESSAGE = 'An unexpected error occurred.';
const MAX_MESSAGE_LENGTH = 500;

export function toErrorEnvelope(error: unknown, requestId: string): ErrorEnvelope {
  const id = requestId && requestId.length > 0 ? requestId : 'unknown';

  if (error instanceof AppError) {
    const body: ErrorBody = {
      code: error.code,
      message: error.expose ? sanitizeMessage(error.message) : GENERIC_MESSAGE,
      requestId: id,
    };
    if (error.expose && error.details !== undefined) {
      body.details = error.details;
    }
    return { error: body };
  }

  return { error: { code: ErrorCodes.INTERNAL_ERROR, message: GENERIC_MESSAGE, requestId: id } };
}

function sanitizeMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return 'Request failed.';
  }
  return trimmed.length > MAX_MESSAGE_LENGTH
    ? `${trimmed.slice(0, MAX_MESSAGE_LENGTH - 3)}...`
    : trimmed;
}

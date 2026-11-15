import { redactObject, redactValue } from '../redaction';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  readonly level: LogLevel;
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  service: string;
  env: string;
  version?: string;
  level?: LogLevel;
  bindings?: Record<string, unknown>;
  sink?: (line: string) => void;
  clock?: () => Date;
}

export function createLogger(options: LoggerOptions): Logger {
  return new JsonLogger(
    options.level ?? defaultLevel(),
    options.service,
    options.env,
    options.version,
    options.bindings ?? {},
    options.sink ?? defaultSink,
    options.clock ?? (() => new Date()),
  );
}

export function createNullLogger(): Logger {
  return new JsonLogger(
    'error',
    'null',
    'null',
    undefined,
    {},
    () => undefined,
    () => new Date(),
  );
}

class JsonLogger implements Logger {
  constructor(
    readonly level: LogLevel,
    private readonly service: string,
    private readonly env: string,
    private readonly version: string | undefined,
    private readonly bindings: Record<string, unknown>,
    private readonly sink: (line: string) => void,
    private readonly clock: () => Date,
  ) {}

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta);
  }

  child(bindings: Record<string, unknown>): Logger {
    return new JsonLogger(
      this.level,
      this.service,
      this.env,
      this.version,
      { ...this.bindings, ...bindings },
      this.sink,
      this.clock,
    );
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) {
      return;
    }

    const safeMessage = redactValue(message);
    const record: Record<string, unknown> = {
      ...redactObject(this.bindings),
      ...(meta ? redactObject(meta) : {}),
      timestamp: this.clock().toISOString(),
      level,
      service: this.service,
      env: this.env,
      ...(this.version ? { version: this.version } : {}),
      message: typeof safeMessage === 'string' ? safeMessage : '[Redacted]',
    };

    this.sink(serialize(record));
  }
}

function serialize(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record);
  } catch {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: record.level ?? 'error',
      service: record.service ?? 'unknown',
      message: 'Failed to serialize log record',
    });
  }
}

function defaultLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.toLowerCase();
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
    ? value
    : 'info';
}

function defaultSink(line: string): void {
  process.stdout.write(`${line}\n`);
}

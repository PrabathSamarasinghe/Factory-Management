import { ValidationError } from '@galatura/platform-kit';

export const FACE_ENGINE_API_KEY_HEADER = 'x-api-key';

export interface FaceEngineConfig {
  modelName: string;
  modelVersion: string;
  embeddingDim: number;
  threshold: number;
  livenessThreshold: number;
  apiKey?: string;
}

export function readFaceEngineConfig(
  overrides: Partial<Pick<FaceEngineConfig, 'embeddingDim'>> = {},
): FaceEngineConfig {
  const embeddingDim =
    overrides.embeddingDim ?? readInteger('ATTENDANCE_FACE_EMBEDDING_DIM', 512, 1, 4096);
  const apiKey = readOptionalText('FACE_ENGINE_API_KEY');
  return {
    modelName: readText('ATTENDANCE_FACE_MODEL_NAME', 'arcface'),
    modelVersion: readText('ATTENDANCE_FACE_MODEL_VERSION', 'unversioned'),
    embeddingDim,
    threshold: readUnitInterval('ATTENDANCE_FACE_THRESHOLD', 0.82),
    livenessThreshold: readUnitInterval('ATTENDANCE_LIVENESS_THRESHOLD', 0.8),
    ...(apiKey ? { apiKey } : {}),
  };
}

function readText(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const value = raw.trim();
  if (value.length === 0) {
    throw new ValidationError(`${name} must not be empty.`);
  }
  return value;
}

function readOptionalText(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }
  return raw.trim();
}

function readInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function readUnitInterval(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new ValidationError(`${name} must be a number greater than 0 and at most 1.`);
  }
  return value;
}

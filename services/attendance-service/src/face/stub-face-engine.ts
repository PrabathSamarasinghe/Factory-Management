import { createHash } from 'node:crypto';
import { ValidationError } from '@galatura/platform-kit';
import { readFaceEngineConfig } from './face-config';
import { cosineSimilarity, type FaceAnalysis, type FaceEngine, type FaceFrame } from './face-engine';

const MIN_FRAME_BYTES = 128;

export class StubFaceEngine implements FaceEngine {
  readonly modelName: string;
  readonly modelVersion: string;
  readonly embeddingDim = 128;
  readonly threshold: number;
  readonly livenessThreshold: number;

  constructor() {
    const config = readFaceEngineConfig({ embeddingDim: this.embeddingDim });
    this.modelName = config.modelName;
    this.modelVersion = config.modelVersion;
    this.threshold = config.threshold;
    this.livenessThreshold = config.livenessThreshold;
  }

  async analyze(frame: FaceFrame): Promise<FaceAnalysis> {
    const bytes = decodeFrame(frame.imageBase64);
    if (bytes.length < MIN_FRAME_BYTES) {
      throw new ValidationError('The captured frame is too small for face analysis.');
    }

    const digest = createHash('sha512').update(bytes).digest();
    const embedding: number[] = [];
    for (let index = 0; index < this.embeddingDim; index += 1) {
      embedding.push((digest[index % digest.length] / 127.5 - 1) / this.embeddingDim);
    }

    const livenessScore = 0.85 + (digest[0] / 255) * 0.14;
    const qualityScore = Math.min(1, 0.55 + Math.log10(bytes.length + 1) / 12);

    return {
      embedding,
      qualityScore,
      livenessScore,
      livenessPassed: livenessScore >= this.livenessThreshold,
    };
  }

  compare(left: number[], right: number[]): number {
    return cosineSimilarity(left, right);
  }
}

export function decodeFrame(imageBase64: string): Buffer {
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    throw new ValidationError('A captured frame is required.');
  }
  const payload = imageBase64.includes(',') ? imageBase64.slice(imageBase64.indexOf(',') + 1) : imageBase64;
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(payload)) {
    throw new ValidationError('The captured frame must be base64 encoded.');
  }
  return Buffer.from(payload, 'base64');
}

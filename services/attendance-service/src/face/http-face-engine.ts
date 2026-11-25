import { DependencyUnavailableError, ValidationError } from '@galatura/platform-kit';
import {
  FACE_ENGINE_API_KEY_HEADER,
  readFaceEngineConfig,
  type FaceEngineConfig,
} from './face-config';
import { cosineSimilarity, type FaceAnalysis, type FaceEngine, type FaceFrame } from './face-engine';

interface HttpFaceResponse extends FaceAnalysis {
  modelVersion?: string;
  livenessThreshold?: number;
}

export class HttpFaceEngine implements FaceEngine {
  readonly modelName: string;
  readonly modelVersion: string;
  readonly embeddingDim: number;
  readonly threshold: number;
  readonly livenessThreshold: number;
  private readonly apiKey?: string;

  constructor(
    private readonly baseUrl: string,
    config: FaceEngineConfig = readFaceEngineConfig(),
  ) {
    this.modelName = config.modelName;
    this.modelVersion = config.modelVersion;
    this.embeddingDim = config.embeddingDim;
    this.threshold = config.threshold;
    this.livenessThreshold = config.livenessThreshold;
    this.apiKey = config.apiKey;
  }

  async analyze(frame: FaceFrame): Promise<FaceAnalysis> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey) {
      headers[FACE_ENGINE_API_KEY_HEADER] = this.apiKey;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify(frame),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new DependencyUnavailableError('The face inference service is unavailable.', {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new DependencyUnavailableError(
        `The face inference service returned HTTP ${response.status}.`,
      );
    }

    const body = (await response.json()) as HttpFaceResponse;
    if (
      !Array.isArray(body.embedding) ||
      body.embedding.length !== this.embeddingDim ||
      !Number.isFinite(body.qualityScore) ||
      !Number.isFinite(body.livenessScore)
    ) {
      throw new ValidationError('The face inference service returned an invalid response.');
    }

    return {
      embedding: body.embedding,
      qualityScore: body.qualityScore,
      livenessScore: body.livenessScore,
      livenessPassed: body.livenessPassed,
    };
  }

  compare(left: number[], right: number[]): number {
    return cosineSimilarity(left, right);
  }
}

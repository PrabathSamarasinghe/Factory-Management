import { DependencyUnavailableError, ValidationError } from '@galatura/platform-kit';
import { cosineSimilarity, type FaceAnalysis, type FaceEngine, type FaceFrame } from './face-engine';

interface HttpFaceResponse extends FaceAnalysis {
  modelVersion?: string;
  livenessThreshold?: number;
}

/**
 * Adapter for a private inference worker. The worker owns the model, liveness
 * classifier and threshold versioning; the API service only stores encrypted
 * embeddings and applies the returned score.
 */
export class HttpFaceEngine implements FaceEngine {
  readonly modelName: string;
  readonly modelVersion: string;
  readonly embeddingDim: number;
  readonly threshold: number;
  readonly livenessThreshold: number;

  constructor(private readonly baseUrl: string) {
    this.modelName = process.env.ATTENDANCE_FACE_MODEL_NAME || 'arcface';
    this.modelVersion = process.env.ATTENDANCE_FACE_MODEL_VERSION || 'unversioned';
    this.embeddingDim = Number(process.env.ATTENDANCE_FACE_EMBEDDING_DIM || 512);
    this.threshold = Number(process.env.ATTENDANCE_FACE_THRESHOLD || 0.82);
    this.livenessThreshold = Number(process.env.ATTENDANCE_LIVENESS_THRESHOLD || 0.8);
  }

  async analyze(frame: FaceFrame): Promise<FaceAnalysis> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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

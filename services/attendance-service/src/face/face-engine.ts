export const FACE_ENGINE = Symbol('FACE_ENGINE');

export interface FaceFrame {
  imageBase64: string;
  capturedAt?: string;
}

export interface FaceAnalysis {
  embedding: number[];
  qualityScore: number;
  livenessScore: number;
  livenessPassed: boolean;
}

export interface FaceEngine {
  readonly modelName: string;
  readonly modelVersion: string;
  readonly embeddingDim: number;
  readonly threshold: number;
  readonly livenessThreshold: number;

  analyze(frame: FaceFrame): Promise<FaceAnalysis>;
  compare(left: number[], right: number[]): number;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

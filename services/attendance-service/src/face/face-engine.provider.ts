import { HttpFaceEngine } from './http-face-engine';
import { StubFaceEngine } from './stub-face-engine';
import type { FaceEngine } from './face-engine';

export function createFaceEngine(): FaceEngine {
  const mode = (process.env.ATTENDANCE_FACE_ENGINE || 'stub').toLowerCase();
  if (mode === 'http') {
    const url = process.env.FACE_ENGINE_URL;
    if (!url) {
      throw new Error('FACE_ENGINE_URL is required when ATTENDANCE_FACE_ENGINE=http.');
    }
    return new HttpFaceEngine(url);
  }
  if (mode !== 'stub') {
    throw new Error(`Unsupported ATTENDANCE_FACE_ENGINE "${mode}". Use "stub" or "http".`);
  }
  return new StubFaceEngine();
}

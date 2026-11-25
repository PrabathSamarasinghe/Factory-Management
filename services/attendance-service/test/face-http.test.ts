import { afterEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@galatura/platform-kit';
import { HttpFaceEngine } from '../src/face/http-face-engine';
import { readFaceEngineConfig } from '../src/face/face-config';

const envKeys = [
  'FACE_ENGINE_API_KEY',
  'ATTENDANCE_FACE_THRESHOLD',
  'ATTENDANCE_LIVENESS_THRESHOLD',
  'ATTENDANCE_FACE_EMBEDDING_DIM',
  'ATTENDANCE_FACE_MODEL_NAME',
  'ATTENDANCE_FACE_MODEL_VERSION',
];
const originals = new Map(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of originals) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.unstubAllGlobals();
});

describe('HTTP face engine', () => {
  it('sends the documented API key header when one is configured', async () => {
    process.env.FACE_ENGINE_API_KEY = 'local-test-key';
    process.env.ATTENDANCE_FACE_THRESHOLD = '0.91';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embedding: [1, 0],
        qualityScore: 0.95,
        livenessScore: 0.93,
        livenessPassed: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = new HttpFaceEngine('http://engine.local/', readFaceEngineConfig({ embeddingDim: 2 }));
    const analysis = await engine.analyze({ imageBase64: 'frame' });

    expect(analysis.livenessPassed).toBe(true);
    expect(engine.threshold).toBe(0.91);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://engine.local/analyze');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      'content-type': 'application/json',
      'x-api-key': 'local-test-key',
    });
  });

  it('omits the API key header when no key is configured', async () => {
    delete process.env.FACE_ENGINE_API_KEY;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embedding: [1, 0],
        qualityScore: 0.95,
        livenessScore: 0.93,
        livenessPassed: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = new HttpFaceEngine('http://engine.local', readFaceEngineConfig({ embeddingDim: 2 }));
    await engine.analyze({ imageBase64: 'frame' });

    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'content-type': 'application/json' });
  });

  it('rejects invalid threshold, liveness and embedding configuration', () => {
    process.env.ATTENDANCE_FACE_THRESHOLD = '1.4';
    expect(() => readFaceEngineConfig()).toThrow(ValidationError);
    process.env.ATTENDANCE_FACE_THRESHOLD = '0.88';
    process.env.ATTENDANCE_LIVENESS_THRESHOLD = 'not-a-number';
    expect(() => readFaceEngineConfig()).toThrow(ValidationError);
    process.env.ATTENDANCE_LIVENESS_THRESHOLD = '0.8';
    process.env.ATTENDANCE_FACE_EMBEDDING_DIM = '0';
    expect(() => readFaceEngineConfig()).toThrow(ValidationError);
  });
});

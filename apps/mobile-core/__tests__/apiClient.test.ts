import { ApiClient, ApiError } from '../src/api/client';

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('generated client wrapper', () => {
  it('sends bearer tokens and renders typed operations', async () => {
    const fetchImpl = jest.fn(async () => response(200, { data: { cursor: 'next' } }));
    const client = new ApiClient({
      baseUrl: () => 'http://localhost/api/v1/',
      clientApp: 'C7',
      token: 'access-token',
      fetch: fetchImpl as any,
    });

    const result = await client.call('realtimeEventsCatchUp', {
      query: { afterId: '5', channel: 'monitor:today' },
    });

    expect(result).toEqual({ cursor: 'next' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'http://localhost/api/v1/realtime/events/catch-up?afterId=5&channel=monitor%3Atoday',
    );
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer access-token',
    );
  });

  it('supports get/post helpers and error envelopes', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, { data: { ok: true } }))
      .mockResolvedValueOnce(
        response(422, { error: { code: 'VALIDATION_FAILED', message: 'Invalid token' } }),
      );
    const client = new ApiClient({
      baseUrl: 'http://localhost/api/v1',
      token: () => 'access-token',
      fetch: fetchImpl as any,
    });

    expect(await client.get('/realtime/health')).toEqual({ ok: true });
    await expect(
      client.post('/realtime/push/tokens', { token: 'device-token', platform: 'ios' }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Invalid token',
    });
    await expect(
      Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'failed')),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

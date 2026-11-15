import { describe, expect, it } from 'vitest';
import { RateLimiterService } from '../src/middleware/rate-limiter.service';

describe('RateLimiterService (Task 1.5)', () => {
  it('allows requests within limit', async () => {
    const limiter = new RateLimiterService();
    const key = `test-ip-${Date.now()}`;

    const res1 = await limiter.checkLimit(key, 5, 10);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(4);

    const res2 = await limiter.checkLimit(key, 5, 10);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(3);
  });

  it('blocks and returns retryAfterSeconds when limit is exceeded', async () => {
    const limiter = new RateLimiterService();
    const key = `test-ip-blocked-${Date.now()}`;

    // Consume all 3 allowed requests
    await limiter.checkLimit(key, 3, 10);
    await limiter.checkLimit(key, 3, 10);
    await limiter.checkLimit(key, 3, 10);

    // 4th request exceeds limit
    const res = await limiter.checkLimit(key, 3, 10);
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
    expect(res.retryAfterSeconds).toBeGreaterThan(0);
  });
});

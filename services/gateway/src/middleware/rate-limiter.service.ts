import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds?: number;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private client: Redis | null = null;
  private readonly memoryStore = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        this.client = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
        this.client.connect().catch((err) => {
          this.logger.warn(`Redis connection failed for rate limiting, using memory: ${err.message}`);
          this.client = null;
        });
      } catch {
        this.client = null;
      }
    }
  }

  async checkLimit(key: string, limit: number, windowSeconds = 60): Promise<RateLimitResult> {
    const now = Math.floor(Date.now() / 1000);

    if (this.client) {
      try {
        const fullKey = `ratelimit:${key}:${Math.floor(now / windowSeconds)}`;
        const count = await this.client.incr(fullKey);
        if (count === 1) {
          await this.client.expire(fullKey, windowSeconds * 2);
        }

        const remaining = Math.max(0, limit - count);
        if (count > limit) {
          const resetAt = (Math.floor(now / windowSeconds) + 1) * windowSeconds;
          return {
            allowed: false,
            limit,
            remaining: 0,
            retryAfterSeconds: Math.max(1, resetAt - now),
          };
        }

        return { allowed: true, limit, remaining };
      } catch {
        // Fallback to memory store below
      }
    }

    // In-memory sliding window fallback
    const entry = this.memoryStore.get(key);
    if (!entry || entry.resetAt <= now) {
      this.memoryStore.set(key, { count: 1, resetAt: now + windowSeconds });
      return { allowed: true, limit, remaining: limit - 1 };
    }

    entry.count++;
    if (entry.count > limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfterSeconds: Math.max(1, entry.resetAt - now),
      };
    }

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - entry.count),
    };
  }
}

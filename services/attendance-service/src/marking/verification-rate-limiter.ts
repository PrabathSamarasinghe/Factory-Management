import { Injectable } from '@nestjs/common';
import { RateLimitedError } from '@galatura/platform-kit';

interface Bucket {
  hits: number[];
}

@Injectable()
export class VerificationRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly windowMs = Number(process.env.ATTENDANCE_RATE_WINDOW_MS || 5 * 60_000);
  private readonly deviceLimit = Number(process.env.ATTENDANCE_DEVICE_ATTEMPT_LIMIT || 10);
  private readonly personLimit = Number(process.env.ATTENDANCE_PERSON_ATTEMPT_LIMIT || 5);

  check(deviceId?: string, personId?: string): void {
    const now = Date.now();
    if (deviceId) {
      this.hit(`device:${deviceId}`, this.deviceLimit, now);
    }
    if (personId) {
      this.hit(`person:${personId}`, this.personLimit, now);
    }
  }

  private hit(key: string, limit: number, now: number): void {
    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((at) => now - at < this.windowMs);
    if (bucket.hits.length >= limit) {
      this.buckets.set(key, bucket);
      throw new RateLimitedError('Too many face verification attempts. Try again later.');
    }
    bucket.hits.push(now);
    this.buckets.set(key, bucket);
  }
}

export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export function safeSentAt(deviceTime: Date, serverTime: string | null): string {
  const deviceMs = deviceTime.getTime();
  if (!serverTime) {
    return new Date(deviceMs).toISOString();
  }
  const serverMs = Date.parse(serverTime);
  if (Number.isNaN(serverMs)) {
    return new Date(deviceMs).toISOString();
  }
  const skew = deviceMs - serverMs;
  if (skew > CLOCK_SKEW_TOLERANCE_MS) {
    return new Date(serverMs + 1000).toISOString();
  }
  if (skew < -CLOCK_SKEW_TOLERANCE_MS) {
    return new Date(serverMs).toISOString();
  }
  return new Date(deviceMs).toISOString();
}

export function nextBackoffMs(attempts: number): number {
  const base = 15000;
  const factor = Math.min(2 ** Math.max(0, attempts - 1), 64);
  return Math.min(base * factor, 600000);
}

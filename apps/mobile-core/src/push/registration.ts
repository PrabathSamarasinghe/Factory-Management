export type PushPlatform = 'android' | 'ios';

export interface PushTokenRegistration {
  token: string;
  platform: PushPlatform;
}

export interface PushRegistrationClient {
  call(
    operationId: 'realtimePushRegister',
    args: { body: PushTokenRegistration },
  ): Promise<unknown>;
}

export function normalizePushPlatform(value: unknown): PushPlatform | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'android' || normalized === 'ios') {
    return normalized;
  }
  if (normalized === 'androidos') {
    return 'android';
  }
  if (normalized === 'iphoneos' || normalized === 'ipados') {
    return 'ios';
  }
  return null;
}

export function buildPushTokenRegistration(
  token: unknown,
  platform: unknown,
): PushTokenRegistration | null {
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  const normalizedPlatform = normalizePushPlatform(platform);
  if (!normalizedToken || !normalizedPlatform) {
    return null;
  }
  return { token: normalizedToken, platform: normalizedPlatform };
}

export async function registerPushToken(
  client: PushRegistrationClient,
  token: unknown,
  platform: unknown,
): Promise<boolean> {
  const registration = buildPushTokenRegistration(token, platform);
  if (!registration) {
    return false;
  }
  try {
    await client.call('realtimePushRegister', { body: registration });
    return true;
  } catch {
    return false;
  }
}

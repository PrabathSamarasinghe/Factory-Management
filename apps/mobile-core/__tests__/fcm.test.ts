import {
  buildPushTokenRegistration,
  normalizePushPlatform,
  registerPushToken,
  type PushTokenRegistration,
} from '../src/push/registration';

describe('push token registration', () => {
  it('normalizes native platform names', () => {
    expect(normalizePushPlatform('android')).toBe('android');
    expect(normalizePushPlatform('iOS')).toBe('ios');
    expect(normalizePushPlatform('iphoneos')).toBe('ios');
    expect(normalizePushPlatform('web')).toBeNull();
    expect(normalizePushPlatform(null)).toBeNull();
  });

  it('builds a registration only for a token and supported platform', () => {
    expect(buildPushTokenRegistration('  token  ', 'ANDROID')).toEqual({
      token: 'token',
      platform: 'android',
    });
    expect(buildPushTokenRegistration('', 'ios')).toBeNull();
    expect(buildPushTokenRegistration('token', undefined)).toBeNull();
  });

  it('calls the realtime push-token operation with token and platform', async () => {
    const calls: Array<{ operationId: string; body: PushTokenRegistration }> = [];
    const client = {
      call: async (operationId: 'realtimePushRegister', args: { body: PushTokenRegistration }) => {
        calls.push({ operationId, body: args.body });
        return { data: { active: true } };
      },
    };

    expect(await registerPushToken(client, 'device-token', 'ios')).toBe(true);
    expect(calls).toEqual([
      {
        operationId: 'realtimePushRegister',
        body: { token: 'device-token', platform: 'ios' },
      },
    ]);
  });

  it('degrades safely when registration fails or the token is unusable', async () => {
    const client = {
      call: async () => {
        throw new Error('offline');
      },
    };
    expect(await registerPushToken(client, 'device-token', 'android')).toBe(false);
    expect(await registerPushToken(client, 'device-token', 'unsupported')).toBe(false);
  });
});

import { Platform } from 'react-native';
import type { ApiClient } from '../api/client';
import { registerPushToken, type PushPlatform } from './registration';

export type MonitorPushHandler = (event: {
  type: 'monitor.refresh';
  source: string;
}) => void;

export interface PushNotificationOptions {
  client?: Pick<ApiClient, 'call'>;
  platform?: PushPlatform | string;
}

let messagingModule: any;
try {
  messagingModule = require('@react-native-firebase/messaging').default;
} catch {
  messagingModule = null;
}

export async function registerForPushNotifications(
  onRefresh: MonitorPushHandler,
  options: PushNotificationOptions = {},
): Promise<() => void> {
  if (!messagingModule) {
    return () => undefined;
  }
  try {
    const messaging = messagingModule();
    const authStatus = await messaging.requestPermission?.();
    const enabled = authStatus === 1 || authStatus === 2 || authStatus === true;
    if (authStatus !== undefined && !enabled) {
      return () => undefined;
    }
    const token = await messaging.getToken?.();
    if (token && options.client) {
      await registerPushToken(options.client, token, options.platform ?? Platform.OS);
    }
    const unsubMessage = messaging.onMessage?.(async () => {
      onRefresh({ type: 'monitor.refresh', source: 'fcm-foreground' });
    });
    let unsubOpened: (() => void) | undefined;
    if (messaging.onNotificationOpenedApp) {
      unsubOpened = messaging.onNotificationOpenedApp(() => {
        onRefresh({ type: 'monitor.refresh', source: 'fcm-opened' });
      });
    }
    messaging
      .getInitialNotification?.()
      .then((notification: unknown) => {
        if (notification) {
          onRefresh({ type: 'monitor.refresh', source: 'fcm-initial' });
        }
      })
      .catch(() => undefined);
    return () => {
      unsubMessage?.();
      unsubOpened?.();
    };
  } catch {
    return () => undefined;
  }
}

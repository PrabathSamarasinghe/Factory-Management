import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'galatura.monitor.deviceId';
const API_BASE_URL_KEY = 'galatura.monitor.apiBaseUrl';

export const DEFAULT_API_BASE_URL =
  Platform.select({
    android: 'http://localhost:3000/api/v1',
    ios: 'http://localhost:3000/api/v1',
    default: 'http://localhost:3000/api/v1',
  }) ?? 'http://localhost:3000/api/v1';

function uuidV4(): string {
  const hex = '0123456789abcdef';
  let value = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) value += '-';
    else if (i === 14) value += '4';
    else if (i === 19) value += hex[8 + Math.floor(Math.random() * 4)];
    else value += hex[Math.floor(Math.random() * 16)];
  }
  return value;
}

export async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = uuidV4();
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export async function getApiBaseUrl(): Promise<string> {
  const stored = await AsyncStorage.getItem(API_BASE_URL_KEY);
  return (stored || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

export async function setApiBaseUrl(value: string): Promise<void> {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === DEFAULT_API_BASE_URL) {
    await AsyncStorage.removeItem(API_BASE_URL_KEY);
    return;
  }
  await AsyncStorage.setItem(API_BASE_URL_KEY, trimmed);
}

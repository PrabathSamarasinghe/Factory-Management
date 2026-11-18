import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { uuidV4 } from '../utils/uuid';

const PERSON_ID_KEY = 'galatura.attendance.personId';
const DEVICE_ID_KEY = 'galatura.attendance.deviceId';
const API_BASE_URL_KEY = 'galatura.attendance.apiBaseUrl';

export const DEFAULT_API_BASE_URL =
  Platform.select({
    android: 'http://10.0.2.2:3000/api/v1',
    ios: 'http://localhost:3000/api/v1',
    default: 'http://localhost:3000/api/v1',
  }) ?? 'http://localhost:3000/api/v1';

export async function getPersonId(): Promise<string | null> {
  return AsyncStorage.getItem(PERSON_ID_KEY);
}

export async function setPersonId(value: string | null): Promise<void> {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    await AsyncStorage.removeItem(PERSON_ID_KEY);
    return;
  }
  await AsyncStorage.setItem(PERSON_ID_KEY, trimmed);
}

export async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
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

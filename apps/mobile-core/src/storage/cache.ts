import AsyncStorage from '@react-native-async-storage/async-storage';

export async function cacheLastView<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ value, cachedAt: new Date().toISOString() }),
    );
  } catch {
    return;
  }
}

export async function readLastView<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { value?: T } | T;
    if (parsed && typeof parsed === 'object' && 'value' in (parsed as object)) {
      return (parsed as { value?: T }).value ?? null;
    }
    return parsed as T;
  } catch {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return null;
  }
}

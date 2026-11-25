import { useCallback, useEffect, useState } from 'react';
import { cacheLastView, readLastView } from '@galatura/mobile-core';
import { onRefresh } from '../refresh';

export function useCachedResource<T>(key: string, loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await loader();
      setData(value);
      await cacheLastView(key, value);
    } catch (e) {
      const cached = await readLastView<T>(key);
      if (cached !== null) {
        setData(cached);
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load data.');
      }
    } finally {
      setLoading(false);
    }
  }, [key, loader]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(
    () =>
      onRefresh(() => {
        void load();
      }),
    [load],
  );

  return { data, loading, error, reload: load };
}

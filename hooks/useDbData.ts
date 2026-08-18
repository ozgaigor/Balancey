/**
 * Hook pobierający dane z bazy i odświeżający je automatycznie
 * po każdej zmianie danych (sygnał `dataVersion` z AppProvider).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useApp } from '../state/AppProvider';

export interface DbDataState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

export function useDbData<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList = []
): DbDataState<T> {
  const { dataVersion, ready } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [localVersion, setLocalVersion] = useState(0);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);

    loaderRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught : new Error(String(caught)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dataVersion, localVersion, ...deps]);

  const reload = useCallback(() => setLocalVersion((value) => value + 1), []);

  return { data, loading, error, reload };
}

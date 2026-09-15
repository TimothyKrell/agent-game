import { useEffect, useRef, useState } from 'react';
import type { Schema } from 'effect';
import { api, ApiError } from './api';

export function useLoad<T, I>(path: string, schema: Schema.Codec<T, I>, interval = 0, enabled = true) {
  const current = useRef({ path, sequence: 0 });

  if (current.current.path !== path) current.current = { path, sequence: 0 };
  const visit = current.current;

  const [snapshot, setSnapshot] = useState<{
    visit: typeof visit;
    data: T | null;
    error: string;
    status: number;
    fault: ApiError | null;
  } | null>(null);

  const refresh = async () => {
    const sequence = ++visit.sequence;

    try {
      const data = await api(path, schema);

      if (current.current !== visit || sequence !== visit.sequence) return;
      setSnapshot({ visit, data, error: '', status: 0, fault: null });
    } catch (error) {
      if (current.current !== visit || sequence !== visit.sequence) return;
      setSnapshot((previous) => ({
        visit,
        data: previous?.visit === visit ? previous.data : null,
        error: error instanceof Error ? error.message : 'The request failed.',
        status: error instanceof ApiError ? error.status : 0,
        fault: error instanceof ApiError ? error : null,
      }));
    }
  };

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = interval ? setInterval(refresh, interval) : null;

    return () => {
      visit.sequence++;

      if (timer) clearInterval(timer);
    };
  }, [path, schema, interval, enabled]);

  const result = snapshot?.visit === visit ? snapshot : null;

  return {
    data: result?.data ?? null,
    error: result?.error ?? '',
    status: result?.status ?? 0,
    fault: result?.fault ?? null,
    refresh,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export function useFetch(path) {
  const [state, setState] = useState({ data: null, error: null, loading: path !== null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get(path)
      .then((data) => { if (!cancelled) setState({ data, error: null, loading: false }); })
      .catch((error) => { if (!cancelled) setState((s) => ({ data: s.data, error, loading: false })); });
    return () => { cancelled = true; };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
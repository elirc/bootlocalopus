import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';

export function createQueryClient({ now = () => Date.now() } = {}) {
  // TODO: one cache entry per key (compare keys by value), shared by every
  // component that uses it.
  return {
    getQueryData(key) {
      return undefined;
    },
    setQueryData(key, updater) {
      throw new Error('setQueryData is not implemented yet');
    },
    invalidateQueries(prefix) {
      throw new Error('invalidateQueries is not implemented yet');
    },
  };
}

const ClientContext = createContext(null);

export function QueryClientProvider({ client, children }) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useQueryClient() {
  return useContext(ClientContext);
}

// Every component fetches for itself and keeps its own copy.
export function useQuery(key, fetcher, { staleTime = 0, enabled = true } = {}) {
  const [state, setState] = useState({ status: 'loading', data: undefined, error: null, isFetching: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    fetcher().then(
      (data) => setState({ status: 'success', data, error: null, isFetching: false }),
      (error) => setState({ status: 'error', data: undefined, error, isFetching: false }),
    );
  }, [JSON.stringify(key), enabled, tick]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}

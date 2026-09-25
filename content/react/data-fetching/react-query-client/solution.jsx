import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';

const hashKey = (key) => JSON.stringify(key);
const startsWith = (key, prefix) =>
  prefix.length <= key.length && prefix.every((part, i) => hashKey(part) === hashKey(key[i]));

// Call now, and turn a synchronous throw into a rejection.
function attempt(fn) {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error);
  }
}

export function createQueryClient({ now = () => Date.now() } = {}) {
  const entries = new Map();

  function entryFor(key) {
    const hash = hashKey(key);
    let entry = entries.get(hash);
    if (!entry) {
      entry = {
        key,
        state: { status: 'loading', data: undefined, error: null, isFetching: false },
        updatedAt: null, // when data last arrived
        invalidated: false,
        requestId: 0, // only the latest request may write
        inFlight: false,
        fetcher: null,
        observers: new Map(), // listener -> { staleTime }
      };
      entries.set(hash, entry);
    }
    return entry;
  }

  function update(entry, patch) {
    entry.state = { ...entry.state, ...patch }; // new object = new snapshot
    for (const listener of [...entry.observers.keys()]) listener();
  }

  function fetchEntry(entry) {
    if (!entry.fetcher) return;
    const id = ++entry.requestId;
    entry.inFlight = true;
    update(entry, { isFetching: true });
    attempt(entry.fetcher).then(
      (data) => {
        if (id !== entry.requestId) return; // superseded
        entry.inFlight = false;
        entry.updatedAt = now();
        entry.invalidated = false;
        update(entry, { status: 'success', data, error: null, isFetching: false });
      },
      (error) => {
        if (id !== entry.requestId) return;
        entry.inFlight = false;
        update(
          entry,
          entry.state.data !== undefined
            ? { error, isFetching: false }
            : { status: 'error', error, isFetching: false },
        );
      },
    );
  }

  const isStale = (entry, staleTime) =>
    entry.updatedAt === null || entry.invalidated || now() - entry.updatedAt >= staleTime;

  const minStaleTime = (entry) => Math.min(...[...entry.observers.values()].map((o) => o.staleTime));

  return {
    getQueryData: (key) => entries.get(hashKey(key))?.state.data,

    setQueryData(key, updater) {
      const entry = entryFor(key);
      const data = typeof updater === 'function' ? updater(entry.state.data) : updater;
      entry.requestId++; // a response already in flight is older than this
      entry.inFlight = false;
      entry.updatedAt = now();
      entry.invalidated = false;
      update(entry, { status: 'success', data, error: null, isFetching: false });
    },

    invalidateQueries(prefix) {
      for (const entry of entries.values()) {
        if (!startsWith(entry.key, prefix)) continue;
        entry.invalidated = true;
        // Active queries refetch now, even if a request is in flight: it may
        // have left before the change that caused the invalidation.
        if (entry.observers.size > 0) fetchEntry(entry);
      }
    },

    // ---- used by the hooks and the provider ----
    _entry: entryFor,
    _observe(entry, listener, staleTime) {
      entry.observers.set(listener, { staleTime });
      return () => entry.observers.delete(listener);
    },
    _ensureFresh(entry, staleTime) {
      if (!entry.inFlight && isStale(entry, staleTime)) fetchEntry(entry);
    },
    _refetch: fetchEntry,
    _onFocus() {
      for (const entry of entries.values()) {
        if (entry.observers.size > 0 && !entry.inFlight && isStale(entry, minStaleTime(entry))) fetchEntry(entry);
      }
    },
  };
}

const ClientContext = createContext(null);

export function QueryClientProvider({ client, children }) {
  useEffect(() => {
    const onFocus = () => client._onFocus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [client]);
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useQueryClient() {
  const client = useContext(ClientContext);
  if (client === null) throw new Error('useQueryClient must be used within a QueryClientProvider');
  return client;
}

export function useQuery(key, fetcher, { staleTime = 0, enabled = true } = {}) {
  const client = useQueryClient();
  const hash = hashKey(key);
  // Looked up by key on every render, so a new key shows its own entry on
  // the very first render.
  const entry = client._entry(key);

  useLayoutEffect(() => {
    entry.fetcher = fetcher; // the latest fetcher, without re-running effects
  });

  const subscribe = useCallback((listener) => client._observe(entry, listener, staleTime), [client, entry, staleTime]);
  const state = useSyncExternalStore(subscribe, () => entry.state);

  useEffect(() => {
    if (enabled) client._ensureFresh(entry, staleTime);
    // `hash` stands for the key; `entry` changes with it.
  }, [client, entry, hash, enabled, staleTime]);

  const refetch = useCallback(() => client._refetch(entry), [client, entry]);
  return { ...state, refetch };
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function createCache() {
  return new Map();
}

function stateFor(cache, key) {
  return cache.has(key)
    ? { status: 'success', data: cache.get(key), error: null, isFetching: true }
    : { status: 'loading', data: undefined, error: null, isFetching: true };
}

export function useCachedQuery(cache, key, fetcher) {
  const fetcherRef = useRef(fetcher);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [state, setState] = useState(() => stateFor(cache, key));

  // Reset *during render* when the key changes. React re-renders straight
  // away, before committing, so no frame shows the old key's data.
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setState(stateFor(cache, key));
  }

  useEffect(() => {
    let current = true;
    fetcherRef.current(key).then(
      (data) => {
        // A valid response for its own key, whoever is still looking.
        cache.set(key, data);
        if (current) setState({ status: 'success', data, error: null, isFetching: false });
      },
      (error) => {
        if (!current) return;
        setState((s) =>
          s.data !== undefined
            ? { ...s, error, isFetching: false }
            : { status: 'error', data: undefined, error, isFetching: false },
        );
      },
    );
    return () => {
      current = false;
    };
  }, [cache, key]);

  return state;
}

export function CustomerPanel({ cache, id, fetchCustomer }) {
  const { status, data, isFetching } = useCachedQuery(cache, id, fetchCustomer);

  if (status === 'loading') return <p>Loading…</p>;
  if (status === 'error') return <p role="alert">Could not load customer</p>;
  return (
    <div>
      <h2>{data.name}</h2>
      {isFetching && <p>Refreshing…</p>}
    </div>
  );
}

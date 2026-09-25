import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function createCache() {
  return new Map();
}

export function useCachedQuery(cache, key, fetcher) {
  // Fetch-on-every-key-change with no cache: every switch flashes "loading".
  const [state, setState] = useState({ status: 'loading', data: undefined, error: null, isFetching: true });

  useEffect(() => {
    setState({ status: 'loading', data: undefined, error: null, isFetching: true });
    fetcher(key).then(
      (data) => setState({ status: 'success', data, error: null, isFetching: false }),
      (error) => setState({ status: 'error', data: undefined, error, isFetching: false }),
    );
  }, [key]);

  return state;
}

export function CustomerPanel({ cache, id, fetchCustomer }) {
  const { status, data } = useCachedQuery(cache, id, fetchCustomer);
  if (status === 'loading') return <p>Loading…</p>;
  if (status === 'error') return <p role="alert">Could not load customer</p>;
  return <h2>{data.name}</h2>;
}

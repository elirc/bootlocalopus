import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function createRequestClient() {
  const inFlight = new Map();

  return {
    fetch(key, fn) {
      const existing = inFlight.get(key);
      if (existing) return existing;

      let promise;
      try {
        promise = Promise.resolve(fn());
      } catch (error) {
        promise = Promise.reject(error);
      }
      inFlight.set(key, promise);

      // `then(clear, clear)` handles the rejection; `finally` would create
      // a second, unhandled, rejected promise.
      const clear = () => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
      };
      promise.then(clear, clear);
      return promise;
    },
  };
}

const LOADING = { status: 'loading', data: undefined, error: null };

export function useDedupedQuery(client, key, fetcher) {
  const fetcherRef = useRef(fetcher);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [state, setState] = useState(LOADING);
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setState(LOADING);
  }

  useEffect(() => {
    let current = true;
    client.fetch(key, () => fetcherRef.current(key)).then(
      (data) => current && setState({ status: 'success', data, error: null }),
      (error) => current && setState({ status: 'error', data: undefined, error }),
    );
    return () => {
      current = false;
    };
  }, [client, key]);

  return state;
}

export function UserBadge({ client, userId, fetchUser }) {
  const { status, data } = useDedupedQuery(client, userId, fetchUser);
  if (status === 'loading') return <span>Loading…</span>;
  if (status === 'error') return <span>Unknown user</span>;
  return <span>{data.name}</span>;
}

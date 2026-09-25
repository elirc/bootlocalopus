import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function createRequestClient() {
  return {
    fetch(key, fn) {
      // TODO: share one in-flight request per key
      return fn();
    },
  };
}

export function useDedupedQuery(client, key, fetcher) {
  const [state, setState] = useState({ status: 'loading', data: undefined, error: null });

  useEffect(() => {
    client.fetch(key, () => fetcher(key)).then(
      (data) => setState({ status: 'success', data, error: null }),
      (error) => setState({ status: 'error', data: undefined, error }),
    );
  }, [client, key]);

  return state;
}

export function UserBadge({ client, userId, fetchUser }) {
  const { status, data } = useDedupedQuery(client, userId, fetchUser);
  if (status === 'loading') return <span>Loading…</span>;
  if (status === 'error') return <span>Unknown user</span>;
  return <span>{data.name}</span>;
}

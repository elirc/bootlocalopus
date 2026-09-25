import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useInfiniteList(fetchPage) {
  const [state, setState] = useState({ items: [], isLoading: true, error: null, hasMore: true });

  const fetchRef = useRef(fetchPage);
  useLayoutEffect(() => {
    fetchRef.current = fetchPage;
  });

  // Synchronous bookkeeping. State is one render late; a second click in the
  // same tick must see "busy" immediately.
  const busy = useRef(false);
  const cursor = useRef(null); // the cursor of the next page to request
  const failed = useRef(false);
  const done = useRef(false);
  const seen = useRef(new Set());
  const mounted = useRef(true);

  const request = useCallback(() => {
    busy.current = true;
    failed.current = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));

    fetchRef.current(cursor.current).then(
      ({ items, nextCursor }) => {
        busy.current = false;
        if (!mounted.current) return;
        const fresh = items.filter((item) => !seen.current.has(item.id));
        for (const item of fresh) seen.current.add(item.id);
        cursor.current = nextCursor;
        done.current = nextCursor === null;
        setState((s) => ({ items: [...s.items, ...fresh], isLoading: false, error: null, hasMore: !done.current }));
      },
      (error) => {
        busy.current = false;
        if (!mounted.current) return;
        failed.current = true; // cursor unchanged, so retry asks for the same page
        setState((s) => ({ ...s, isLoading: false, error }));
      },
    );
  }, []);

  const loadMore = useCallback(() => {
    if (busy.current || failed.current || done.current) return;
    request();
  }, [request]);

  const retry = useCallback(() => {
    if (busy.current || !failed.current) return;
    request();
  }, [request]);

  useEffect(() => {
    mounted.current = true;
    // First page. The guard also keeps StrictMode's second mount from
    // requesting it twice.
    if (!busy.current && seen.current.size === 0 && !done.current && !failed.current) request();
    return () => {
      mounted.current = false;
    };
  }, [request]);

  return { ...state, loadMore, retry };
}

export function Feed({ fetchPage }) {
  const { items, isLoading, error, hasMore, loadMore, retry } = useInfiniteList(fetchPage);
  return (
    <div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
      {isLoading && <p>Loading…</p>}
      {error && (
        <div>
          <p role="alert">Could not load more</p>
          <button onClick={retry}>Try again</button>
        </div>
      )}
      {hasMore && !error && (
        <button onClick={loadMore} disabled={isLoading}>
          Load more
        </button>
      )}
      {!hasMore && <p>You're all caught up</p>}
    </div>
  );
}

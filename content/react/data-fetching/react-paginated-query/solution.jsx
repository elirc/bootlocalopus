import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function usePagedData(page, fetchPage) {
  const fetchRef = useRef(fetchPage);
  useLayoutEffect(() => {
    fetchRef.current = fetchPage;
  });

  // Loaded pages. The ref is the source of truth for callbacks; the state
  // copy is what render reads, so render stays pure.
  const cacheRef = useRef(new Map());
  const [pages, setPages] = useState(() => new Map());
  const inFlight = useRef(new Map());
  const [failure, setFailure] = useState(null); // { page, error }

  // The last page that was actually on screen: the placeholder source.
  const [shownPage, setShownPage] = useState(null);
  const current = pages.get(page);
  if (current !== undefined && shownPage !== page) setShownPage(page);

  useEffect(() => {
    let active = true;

    const load = (p) => {
      if (cacheRef.current.has(p)) return Promise.resolve(cacheRef.current.get(p));
      let request = inFlight.current.get(p);
      if (!request) {
        request = Promise.resolve(fetchRef.current(p));
        inFlight.current.set(p, request);
        request.then(
          (data) => {
            inFlight.current.delete(p);
            cacheRef.current.set(p, data);
            setPages(new Map(cacheRef.current));
          },
          () => inFlight.current.delete(p), // failures are not cached
        );
      }
      return request;
    };

    load(page).then(
      (data) => {
        // Warm the next page so "Next" is instant. Its errors are ignored:
        // the page is simply fetched again when visited.
        if (active && data.hasMore) load(page + 1).catch(() => {});
      },
      (error) => {
        if (active) setFailure({ page, error });
      },
    );
    return () => {
      active = false;
    };
  }, [page]);

  const error = failure && failure.page === page ? failure.error : null;
  const data = current ?? (shownPage === null ? undefined : pages.get(shownPage));
  return {
    data,
    isPlaceholder: current === undefined && data !== undefined,
    isFetching: current === undefined && error === null,
    error,
  };
}

export function OrdersTable({ fetchPage }) {
  const [page, setPage] = useState(1);
  const { data, isPlaceholder, isFetching, error } = usePagedData(page, fetchPage);

  return (
    <div>
      <p>Page {page}</p>
      {data === undefined && isFetching && <p>Loading…</p>}
      {error && <p role="alert">Could not load page {page}</p>}
      {data && (
        <ul aria-busy={isPlaceholder}>
          {data.items.map((order) => (
            <li key={order.id}>{order.id}</li>
          ))}
        </ul>
      )}
      <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
        Previous
      </button>
      <button onClick={() => setPage((p) => p + 1)} disabled={isPlaceholder || !data?.hasMore}>
        Next
      </button>
    </div>
  );
}

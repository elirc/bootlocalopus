import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function usePagedData(page, fetchPage) {
  // Every page change empties the screen and refetches from scratch.
  const [state, setState] = useState({ data: undefined, isPlaceholder: false, isFetching: true, error: null });

  useEffect(() => {
    setState({ data: undefined, isPlaceholder: false, isFetching: true, error: null });
    fetchPage(page).then(
      (data) => setState({ data, isPlaceholder: false, isFetching: false, error: null }),
      (error) => setState({ data: undefined, isPlaceholder: false, isFetching: false, error }),
    );
  }, [page]);

  return state;
}

export function OrdersTable({ fetchPage }) {
  const [page, setPage] = useState(1);
  const { data, isFetching, error } = usePagedData(page, fetchPage);

  return (
    <div>
      <p>Page {page}</p>
      {isFetching && <p>Loading…</p>}
      {error && <p role="alert">Could not load page {page}</p>}
      {data && (
        <ul>
          {data.items.map((order) => (
            <li key={order.id}>{order.id}</li>
          ))}
        </ul>
      )}
      <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
        Previous
      </button>
      <button onClick={() => setPage((p) => p + 1)} disabled={!data?.hasMore}>
        Next
      </button>
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useInfiniteList(fetchPage) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  // The guard lives in state, so two clicks in one tick both pass it.
  const loadMore = () => {
    if (isLoading || !hasMore) return;
    setLoading(true);
    fetchPage(cursor).then(
      (page) => {
        setItems([...items, ...page.items]);
        setCursor(page.nextCursor);
        setHasMore(page.nextCursor !== null);
        setLoading(false);
      },
      (e) => {
        setItems([]); // start over
        setError(e);
        setLoading(false);
      },
    );
  };

  const retry = () => {
    // TODO
  };

  useEffect(() => {
    loadMore();
  }, []);

  return { items, isLoading, error, hasMore, loadMore, retry };
}

export function Feed({ fetchPage }) {
  const { items, isLoading, hasMore, loadMore } = useInfiniteList(fetchPage);
  return (
    <div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
      {hasMore && <button onClick={loadMore}>Load more</button>}
    </div>
  );
}

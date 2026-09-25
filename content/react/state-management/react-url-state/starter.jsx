import { useCallback, useState, useSyncExternalStore } from 'react';

export function useSearchParam(name, defaultValue = '') {
  // Read once from the URL, then never look at it again.
  const [value, setState] = useState(() => new URLSearchParams(window.location.search).get(name) ?? defaultValue);

  const setValue = (next, options) => {
    setState(next);
    // TODO: write the URL (push or replace), keep other params, notify readers
  };

  return [value, setValue];
}

export function ProductSearch({ products }) {
  const [q, setQ] = useSearchParam('q');
  const [category, setCategory] = useSearchParam('category', 'all');
  // TODO: category options and filtering
  return (
    <div>
      <input type="search" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value, { replace: true })} />
      <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="all">all</option>
      </select>
      <ul />
    </div>
  );
}

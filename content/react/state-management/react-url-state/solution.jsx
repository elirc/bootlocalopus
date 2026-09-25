import { useCallback, useSyncExternalStore } from 'react';

// pushState/replaceState do not fire any event, so same-page readers are
// told directly; the browser's Back/Forward arrive as `popstate`.
const listeners = new Set();

function subscribe(onChange) {
  listeners.add(onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('popstate', onChange);
  };
}

const getSearch = () => window.location.search;

export function useSearchParam(name, defaultValue = '') {
  // The snapshot is the query string itself: a primitive, so unchanged
  // URLs compare equal.
  const search = useSyncExternalStore(subscribe, getSearch);
  const value = new URLSearchParams(search).get(name) ?? defaultValue;

  const setValue = useCallback(
    (next, { replace = false } = {}) => {
      const url = new URL(window.location.href);
      if (next === '' || next === defaultValue) url.searchParams.delete(name);
      else url.searchParams.set(name, next);
      if (url.href === window.location.href) return;

      const method = replace ? 'replaceState' : 'pushState';
      window.history[method](null, '', url.pathname + url.search + url.hash);
      for (const listener of [...listeners]) listener();
    },
    [name, defaultValue],
  );

  return [value, setValue];
}

export function ProductSearch({ products }) {
  const [q, setQ] = useSearchParam('q');
  const [category, setCategory] = useSearchParam('category', 'all');

  const categories = [...new Set(products.map((p) => p.category))];
  const needle = q.toLowerCase();
  const visible = products.filter(
    (p) => p.name.toLowerCase().includes(needle) && (category === 'all' || p.category === category),
  );

  return (
    <div>
      <input type="search" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value, { replace: true })} />
      <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="all">all</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <ul>
        {visible.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
    </div>
  );
}

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

// Same-tab readers: the browser only fires `storage` in *other* tabs.
const listeners = new Set();

function subscribe(onChange) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function parse(raw, fallback) {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function useLocalStorage(key, initialValue) {
  // First-render semantics, like useState: an inline object literal passed
  // on every render must not change the value's identity.
  const initialRef = useRef(initialValue);

  // The snapshot is the raw string: two reads of an unchanged key are
  // identical, which is what useSyncExternalStore requires.
  const raw = useSyncExternalStore(subscribe, () => window.localStorage.getItem(key));
  const value = useMemo(() => parse(raw, initialRef.current), [raw]);

  const setValue = useCallback(
    (next) => {
      // Read the stored value now, not the one from this render's closure,
      // so consecutive updaters compose.
      const current = parse(window.localStorage.getItem(key), initialRef.current);
      const resolved = typeof next === 'function' ? next(current) : next;
      window.localStorage.setItem(key, JSON.stringify(resolved));
      notify();
    },
    [key],
  );

  const remove = useCallback(() => {
    window.localStorage.removeItem(key);
    notify();
  }, [key]);

  return [value, setValue, remove];
}

import { useState, useCallback, useEffect } from 'react';

export function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  // The updater form keeps the dependency list empty, so toggle is stable.
  const toggle = useCallback(() => setOn((current) => !current), []);
  return [on, toggle, setOn];
}

export function useCounter(start = 0, { min, max } = {}) {
  const [count, setCount] = useState(start);

  const clamp = useCallback(
    (n) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)),
    [min, max],
  );

  const inc = useCallback(() => setCount((c) => clamp(c + 1)), [clamp]);
  const dec = useCallback(() => setCount((c) => clamp(c - 1)), [clamp]);
  const reset = useCallback(() => setCount(clamp(start)), [clamp, start]);

  return { count, inc, dec, reset };
}

export function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    // Runs before the next effect and on unmount, so no stray updates.
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

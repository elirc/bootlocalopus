import { useCallback, useRef, useSyncExternalStore } from 'react';

export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,
    setState(update) {
      const partial = typeof update === 'function' ? update(state) : update;
      const changed = Object.keys(partial).some((key) => !Object.is(partial[key], state[key]));
      if (!changed) return;
      state = { ...state, ...partial };
      // Iterate a copy: a listener may unsubscribe while we loop.
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every((k) => Object.hasOwn(b, k) && Object.is(a[k], b[k]));
  }
  return false;
}

const identity = (s) => s;

export function useStore(store, selector = identity, isEqual = Object.is) {
  // The last selection, so getSnapshot can return the *same* value while
  // the selected slice is equal. That is what keeps useSyncExternalStore
  // from seeing a "change" on every call.
  const memo = useRef(null);

  const getSnapshot = () => {
    const state = store.getState();
    const cached = memo.current;
    if (cached && cached.state === state && cached.selector === selector) return cached.selection;
    const next = selector(state);
    if (cached && isEqual(cached.selection, next)) {
      memo.current = { state, selector, selection: cached.selection };
      return cached.selection;
    }
    memo.current = { state, selector, selection: next };
    return next;
  };

  const subscribe = useCallback((onChange) => store.subscribe(onChange), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

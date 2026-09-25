import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  return {
    getState: () => state,
    setState(update) {
      // TODO: merge, skip no-op updates, notify listeners
      throw new Error('setState is not implemented yet');
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function shallowEqual(a, b) {
  // TODO
  return Object.is(a, b);
}

export function useStore(store, selector = (s) => s, isEqual = Object.is) {
  // TODO: subscribe with useSyncExternalStore and re-render only when the
  // selected slice changes.
  return selector(store.getState());
}

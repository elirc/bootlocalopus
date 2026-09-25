import { useCallback, useMemo, useReducer } from 'react';

function reducer(state, action) {
  const { past, present, future } = state;
  switch (action.type) {
    case 'set': {
      const next = typeof action.value === 'function' ? action.value(present) : action.value;
      if (Object.is(next, present)) return state; // no change, no history entry
      return { past: [...past, present].slice(-action.limit), present: next, future: [] };
    }
    case 'undo':
      if (past.length === 0) return state;
      return { past: past.slice(0, -1), present: past[past.length - 1], future: [present, ...future] };
    case 'redo':
      if (future.length === 0) return state;
      return { past: [...past, present], present: future[0], future: future.slice(1) };
    case 'reset':
      return { past: [...past, present], present: action.value, future: [] };
    default:
      return state;
  }
}

/**
 * State with undo/redo. `set` takes a value or an updater `(prev) => next`.
 * Keeps at most `limit` undo steps (the oldest are dropped). The functions are stable across renders.
 */
export function useUndoable(initial, { limit = 50 } = {}) {
  const [state, dispatch] = useReducer(reducer, { past: [], present: initial, future: [] });

  const set = useCallback((value) => dispatch({ type: 'set', value, limit }), [limit]);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const reset = useCallback((value) => dispatch({ type: 'reset', value }), []);

  return useMemo(() => ({
    value: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set,
    undo,
    redo,
    reset,
  }), [state, set, undo, redo, reset]);
}

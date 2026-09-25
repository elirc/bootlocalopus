import { useReducer, useState } from 'react';

function historyReducer(state, action) {
  const { past, present, future } = state;
  switch (action.type) {
    case 'set': {
      const next = typeof action.next === 'function' ? action.next(present) : action.next;
      if (Object.is(next, present)) return state;
      const grown = [...past, present];
      return {
        past: grown.length > action.limit ? grown.slice(grown.length - action.limit) : grown,
        present: next,
        future: [],
      };
    }
    case 'undo':
      if (past.length === 0) return state;
      return { past: past.slice(0, -1), present: past[past.length - 1], future: [present, ...future] };
    case 'redo':
      if (future.length === 0) return state;
      return { past: [...past, present], present: future[0], future: future.slice(1) };
    case 'reset':
      return { past: [], present: action.value, future: [] };
    default:
      return state;
  }
}

export function useUndoable(initialPresent, { limit = 100 } = {}) {
  // A reducer, so consecutive set() calls each see the previous result.
  const [state, dispatch] = useReducer(historyReducer, undefined, () => ({
    past: [],
    present: initialPresent,
    future: [],
  }));

  // dispatch is stable, so these are created once. Like `initialPresent`,
  // `limit` is read when the hook mounts.
  const [actions] = useState(() => ({
    set: (next) => dispatch({ type: 'set', next, limit }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    reset: (value) => dispatch({ type: 'reset', value }),
  }));

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    ...actions,
  };
}

export function Counter() {
  const { present, set, undo, redo, canUndo, canRedo } = useUndoable(0);
  return (
    <div>
      <output>{present}</output>
      <button onClick={() => set((n) => n + 1)}>+1</button>
      <button onClick={undo} disabled={!canUndo}>
        Undo
      </button>
      <button onClick={redo} disabled={!canRedo}>
        Redo
      </button>
    </div>
  );
}

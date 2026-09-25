import { useReducer, useState } from 'react';

export function useUndoable(initialPresent, { limit = 100 } = {}) {
  const [present, setPresent] = useState(initialPresent);
  // TODO: keep past and future, and make undo/redo work
  return {
    present,
    set: setPresent,
    undo: () => {},
    redo: () => {},
    reset: setPresent,
    canUndo: false,
    canRedo: false,
  };
}

export function Counter() {
  const { present, set, undo, redo, canUndo, canRedo } = useUndoable(0);
  return (
    <div>
      <output>{present}</output>
      <button onClick={() => set((n) => n + 1)}>+1</button>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
    </div>
  );
}

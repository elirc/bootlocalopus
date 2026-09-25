// Same behaviour: one useState holding a history array and a cursor, functions made once with useState.
import { useRef, useState } from 'react';

export function useUndoable(initial, { limit = 50 } = {}) {
  const [h, setH] = useState(() => ({ entries: [initial], at: 0 }));
  const limitRef = useRef(limit);
  limitRef.current = limit;

  const [api] = useState(() => ({
    set(value) {
      setH((prev) => {
        const current = prev.entries[prev.at];
        const next = typeof value === 'function' ? value(current) : value;
        if (Object.is(next, current)) return prev;
        let entries = [...prev.entries.slice(0, prev.at + 1), next];
        const maxLength = limitRef.current + 1;
        if (entries.length > maxLength) entries = entries.slice(entries.length - maxLength);
        return { entries, at: entries.length - 1 };
      });
    },
    undo() {
      setH((prev) => (prev.at === 0 ? prev : { ...prev, at: prev.at - 1 }));
    },
    redo() {
      setH((prev) => (prev.at === prev.entries.length - 1 ? prev : { ...prev, at: prev.at + 1 }));
    },
    reset(value) {
      setH({ entries: [value], at: 0 });
    },
  }));

  return {
    ...api,
    value: h.entries[h.at],
    canRedo: h.at < h.entries.length - 1,
    canUndo: h.at > 0,
  };
}

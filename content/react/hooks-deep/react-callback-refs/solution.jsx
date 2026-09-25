import { useCallback, useRef, useState } from 'react';

export function useMergedRef(...refs) {
  return useCallback(
    (node) => {
      for (const ref of refs) {
        if (typeof ref === 'function') ref(node);
        else if (ref != null) ref.current = node;
      }
    },
    // The refs themselves are the dependencies: same refs, same callback.
    refs,
  );
}

export function InlineEdit({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Set only by a user action, so the first mount never steals focus.
  const returnFocus = useRef(false);

  // Callback refs run when *this* element attaches, whenever that is.
  const focusInput = useCallback((node) => {
    if (node) {
      node.focus();
      node.select();
    }
  }, []);

  const focusEditButton = useCallback((node) => {
    if (node && returnFocus.current) {
      returnFocus.current = false;
      node.focus();
    }
  }, []);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const finish = () => {
    returnFocus.current = true;
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={focusInput}
        aria-label="Edit value"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSave(draft);
            finish();
          } else if (e.key === 'Escape') {
            finish();
          }
        }}
      />
    );
  }

  return (
    <div>
      <span>{value}</span>
      <button ref={focusEditButton} onClick={startEditing}>
        Edit
      </button>
    </div>
  );
}

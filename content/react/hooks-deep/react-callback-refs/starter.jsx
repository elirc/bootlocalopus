import { useCallback, useEffect, useRef, useState } from 'react';

export function useMergedRef(...refs) {
  // TODO: return a stable callback ref that feeds every ref
  return null;
}

export function InlineEdit({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  // Bug: runs once on mount, when the input does not exist yet.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (editing) {
    return <input ref={inputRef} aria-label="Edit value" defaultValue={value} />;
  }
  return (
    <div>
      <span>{value}</span>
      <button onClick={() => setEditing(true)}>Edit</button>
    </div>
  );
}

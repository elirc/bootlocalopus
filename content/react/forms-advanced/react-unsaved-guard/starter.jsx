import { useCallback, useEffect, useRef, useState } from 'react';

export function useUnsavedChangesGuard(when, options = {}) {
  // TODO: a beforeunload listener only while `when` is true, and a stable
  // guard(action) that asks first when there are unsaved changes.
  return (action) => {
    action();
    return true;
  };
}

export function NoteEditor({ note, onSave, onClose, confirm }) {
  const [text, setText] = useState(note);
  const guard = useUnsavedChangesGuard(false, { confirm });

  return (
    <div>
      <label>
        Note
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="button" onClick={() => onSave(text)}>Save</button>
      <button type="button" onClick={() => guard(onClose)}>Close</button>
    </div>
  );
}

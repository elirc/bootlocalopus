import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave anyway?';
const defaultConfirm = (text) => window.confirm(text);

export function useUnsavedChangesGuard(when, options = {}) {
  const { message = DEFAULT_MESSAGE, confirm = defaultConfirm } = options;

  // Registered only while there is something to lose. A permanent listener
  // that checks a flag would still keep some browsers from using the
  // back/forward cache, and is where stale-closure bugs live.
  useEffect(() => {
    if (!when) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  // The latest values, for a guard whose identity never changes.
  const latest = useRef({ when, message, confirm });
  useEffect(() => {
    latest.current = { when, message, confirm };
  });

  return useCallback((action) => {
    const { when: dirty, message: text, confirm: ask } = latest.current;
    if (dirty && !ask(text)) return false;
    action();
    return true;
  }, []);
}

export function NoteEditor({ note, onSave, onClose, confirm }) {
  const [text, setText] = useState(note);
  const [saved, setSaved] = useState(note);
  const guard = useUnsavedChangesGuard(text !== saved, { confirm });

  const save = async () => {
    const sent = text;
    try {
      await onSave(sent);
      // What was sent is saved; later typing is still unsaved.
      setSaved(sent);
    } catch {
      // Not saved: the text stays unsaved, so the guard keeps protecting it.
      // (A real editor would also tell the user; see the dirty-tracking lesson.)
    }
  };

  return (
    <div>
      <label>
        Note
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="button" onClick={save}>Save</button>
      <button type="button" onClick={() => guard(onClose)}>Close</button>
    </div>
  );
}

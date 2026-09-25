import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const defaultSchedule = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export function useAutosave(value, save, { delay = 1000, schedule = defaultSchedule } = {}) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  // First attempt: saves on every change, immediately, with whatever `save`
  // this render had. Overlapping saves can land out of order.
  useEffect(() => {
    save(value);
  }, [value, save]);

  const flush = () => {};

  return { status, error, flush };
}

export function NoteEditor({ initialText, save, schedule }) {
  const [text, setText] = useState(initialText);
  const { status, error, flush } = useAutosave(text, save, { delay: 1000, schedule });

  // TODO: show the status message
  return (
    <div>
      <textarea aria-label="Note" value={text} onChange={(e) => setText(e.target.value)} />
      <p role="status"></p>
      <button onClick={flush}>Save now</button>
    </div>
  );
}

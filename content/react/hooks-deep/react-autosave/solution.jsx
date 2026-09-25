import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const defaultSchedule = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export function useAutosave(value, save, { delay = 1000, schedule = defaultSchedule } = {}) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  // Everything a timer or a promise callback reads later goes through refs,
  // so they always see the latest render instead of the one that created them.
  const latest = useRef({ value, save, delay, schedule });
  useLayoutEffect(() => {
    latest.current = { value, save, delay, schedule };
  });

  const savedValue = useRef(value); // what the server last confirmed
  const everSaved = useRef(false);
  const inFlight = useRef(null); // { value } while a save is running
  const queued = useRef(false); // a save was asked for while one was running
  const cancelTimer = useRef(null);
  const mounted = useRef(false);

  const clearTimer = () => {
    cancelTimer.current?.();
    cancelTimer.current = null;
  };

  const saveNow = useCallback(function saveNow() {
    clearTimer();
    const v = latest.current.value;
    if (Object.is(v, savedValue.current)) {
      // Edited and reverted: nothing to send.
      if (!inFlight.current) setStatus(everSaved.current ? 'saved' : 'idle');
      return;
    }
    if (inFlight.current) {
      // One save at a time, or an older write can land after a newer one.
      queued.current = true;
      return;
    }

    inFlight.current = { value: v };
    setStatus('saving');
    setError(null);

    let request;
    try {
      request = Promise.resolve(latest.current.save(v));
    } catch (e) {
      request = Promise.reject(e);
    }

    const settle = (ok, reason) => {
      inFlight.current = null;
      if (ok) {
        savedValue.current = v;
        everSaved.current = true;
      }
      if (!mounted.current) return;
      if (!ok) setError(reason);

      const again = queued.current;
      queued.current = false;
      if (again && !Object.is(latest.current.value, savedValue.current)) {
        saveNow();
        return;
      }
      if (!ok) setStatus('error');
      else setStatus(Object.is(latest.current.value, v) ? 'saved' : 'pending');
    };
    request.then(
      () => settle(true),
      (reason) => settle(false, reason),
    );
  }, []);

  // Debounce: every change restarts the timer.
  const lastSeen = useRef(value);
  useEffect(() => {
    if (Object.is(value, lastSeen.current)) return; // mount, or a StrictMode re-run
    lastSeen.current = value;
    clearTimer();
    if (!inFlight.current) setStatus('pending');
    cancelTimer.current = latest.current.schedule(saveNow, latest.current.delay);
  }, [value, saveNow]);

  // Unmount: do not lose the last edit.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
      const v = latest.current.value;
      const alreadySending = inFlight.current && Object.is(inFlight.current.value, v);
      if (!Object.is(v, savedValue.current) && !alreadySending) {
        // Fire and forget: there is no screen left to report the outcome on.
        try {
          Promise.resolve(latest.current.save(v)).catch(() => {});
        } catch {
          // a synchronous throw has nowhere to go either
        }
      }
    };
  }, []);

  return { status, error, flush: saveNow };
}

const LABELS = {
  idle: '',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
};

export function NoteEditor({ initialText, save, schedule }) {
  const [text, setText] = useState(initialText);
  const { status, error, flush } = useAutosave(text, save, { delay: 1000, schedule });

  const message = status === 'error' ? `Save failed: ${error?.message ?? error}` : LABELS[status];

  return (
    <div>
      <textarea aria-label="Note" value={text} onChange={(e) => setText(e.target.value)} />
      <p role="status">{message}</p>
      <button onClick={flush}>Save now</button>
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const AUTO_DISMISS_MS = 5000;
export const MAX_TOASTS = 3;

const ToastContext = createContext(null);
const without = (list, id) => list.filter((t) => t.id !== id);

const realSchedule = (fn, ms) => {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
};

/**
 * `schedule(fn, ms)` runs fn after ms and returns a cancel function.
 * Injected so tests control time; the app uses setTimeout.
 */
export function ToastProvider({ schedule = realSchedule, children }) {
  const [toasts, setToasts] = useState([]);
  const current = useRef([]); // the latest list, so callbacks never read a stale render
  const timers = useRef(new Map()); // id -> cancel
  const nextId = useRef(1);

  const commit = useCallback((list) => {
    current.current = list;
    setToasts(list);
  }, []);

  const stopTimer = useCallback((id) => {
    timers.current.get(id)?.();
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback((id) => {
    stopTimer(id);
    commit(without(current.current, id));
  }, [stopTimer, commit]);

  const startTimer = useCallback((id) => {
    stopTimer(id);
    timers.current.set(id, schedule(() => {
      timers.current.delete(id);
      commit(without(current.current, id));
    }, AUTO_DISMISS_MS));
  }, [schedule, stopTimer, commit]);

  const notify = useCallback((message, { kind = 'info' } = {}) => {
    const id = nextId.current++;
    const next = [...current.current, { id, message, kind }];
    // Over the limit: the oldest go first, and so do their timers.
    for (const old of next.slice(0, -MAX_TOASTS)) stopTimer(old.id);
    commit(next);
    if (kind !== 'error') startTimer(id); // errors stay until the user closes them
  }, [startTimer, stopTimer, commit]);

  // Unmounting must not leave timers behind.
  useEffect(() => () => {
    for (const cancel of timers.current.values()) cancel();
    timers.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div aria-label="Notifications">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => stopTimer(t.id)}
            onMouseLeave={() => { if (t.kind !== 'error') startTimer(t.id); }}
          >
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error('useToast must be used inside a ToastProvider');
  return notify;
}

// Same behaviour: each toast is its own component whose effect owns its timer; a reducer holds the list.
import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react';

export const AUTO_DISMISS_MS = 5000;
export const MAX_TOASTS = 3;

const Notify = createContext(undefined);

function listReducer(list, action) {
  switch (action.type) {
    case 'push': return [...list, action.toast].slice(-MAX_TOASTS);
    case 'drop': return list.filter((t) => t.id !== action.id);
    default: return list;
  }
}

function Toast({ toast, schedule, onDone }) {
  const [hovered, setHovered] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (toast.kind === 'error' || hovered) return undefined;
    return schedule(() => done.current(toast.id), AUTO_DISMISS_MS);
  }, [toast, hovered, schedule]);

  return (
    <li role={toast.kind === 'error' ? 'alert' : 'status'} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {toast.message}
      <button aria-label="Dismiss" onClick={() => done.current(toast.id)}>✕</button>
    </li>
  );
}

const defaultSchedule = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

export function ToastProvider({ schedule = defaultSchedule, children }) {
  const [list, dispatch] = useReducer(listReducer, []);
  const seq = useRef(0);
  const [notify] = useState(() => (message, options = {}) => {
    seq.current += 1;
    dispatch({ type: 'push', toast: { id: seq.current, message, kind: options.kind || 'info' } });
  });

  return (
    <Notify.Provider value={notify}>
      {children}
      <ul className="toasts">
        {list.map((t) => (
          <Toast key={t.id} toast={t} schedule={schedule} onDone={(id) => dispatch({ type: 'drop', id })} />
        ))}
      </ul>
    </Notify.Provider>
  );
}

export function useToast() {
  const notify = useContext(Notify);
  if (notify === undefined) throw new Error('Wrap your app in <ToastProvider>');
  return notify;
}

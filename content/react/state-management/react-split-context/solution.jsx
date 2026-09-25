import { createContext, useContext, useMemo, useRef, useState } from 'react';

// `null` default: a missing provider is detected, not papered over.
const ToastsContext = createContext(null);
const ToastActionsContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  // Created once. The updater form means the actions never read `toasts`,
  // so they never need to be recreated when it changes.
  const actions = useMemo(
    () => ({
      show(message) {
        const id = nextId.current++;
        setToasts((list) => [...list, { id, message }]);
        return id;
      },
      dismiss(id) {
        setToasts((list) => (list.some((t) => t.id === id) ? list.filter((t) => t.id !== id) : list));
      },
    }),
    [],
  );

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastsContext.Provider value={toasts}>{children}</ToastsContext.Provider>
    </ToastActionsContext.Provider>
  );
}

export function useToasts() {
  const toasts = useContext(ToastsContext);
  if (toasts === null) throw new Error('useToasts must be used within a ToastProvider');
  return toasts;
}

export function useToastActions() {
  const actions = useContext(ToastActionsContext);
  if (actions === null) throw new Error('useToastActions must be used within a ToastProvider');
  return actions;
}

import { createContext, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext({});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = (message) => {
    const id = Date.now();
    setToasts([...toasts, { id, message }]);
    return id;
  };
  const dismiss = (id) => setToasts(toasts.filter((t) => t.id !== id));

  // Every consumer re-renders whenever this object changes, which is every render.
  return <ToastContext.Provider value={{ toasts, show, dismiss }}>{children}</ToastContext.Provider>;
}

export function useToasts() {
  return useContext(ToastContext).toasts;
}

export function useToastActions() {
  const { show, dismiss } = useContext(ToastContext);
  return { show, dismiss };
}

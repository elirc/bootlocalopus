import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export function AnnouncerProvider({ children }) {
  // TODO: two live regions, present from the first render, and a context
  // that hands out a stable announce(message, politeness) function.
  return children;
}

export function useAnnounce() {
  throw new Error('useAnnounce is not implemented');
}

export function AddToCart({ name, onAdd }) {
  const [message, setMessage] = useState('');

  // TODO: disable while pending, and announce the outcome through useAnnounce.
  // A live region rendered only once there is a message is usually not read.
  return (
    <div>
      <button
        type="button"
        onClick={() => onAdd().then(() => setMessage('Added ' + name + ' to cart'))}
      >
        Add {name} to cart
      </button>
      {message && <div aria-live="polite">{message}</div>}
    </div>
  );
}

import { createContext, useCallback, useContext, useState } from 'react';

const AnnounceContext = createContext(null);

// Hidden from sight, not from assistive technology (display: none would
// hide it from both).
const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export function AnnouncerProvider({ children }) {
  // Each message carries a counter, used as its key: announcing the same text
  // twice still renders a new node, which screen readers read again.
  const [polite, setPolite] = useState(null);
  const [assertive, setAssertive] = useState(null);

  // Only state setters inside, so an empty dependency list keeps it stable.
  const announce = useCallback((message, politeness = 'polite') => {
    const set = politeness === 'assertive' ? setAssertive : setPolite;
    set((current) => ({ text: message, n: (current?.n ?? 0) + 1 }));
  }, []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      {/* Rendered from the start and empty: a region inserted together with
          its message is often not announced at all. */}
      <div aria-live="polite" aria-atomic="true" style={visuallyHidden}>
        {polite && <p key={polite.n}>{polite.text}</p>}
      </div>
      <div aria-live="assertive" aria-atomic="true" style={visuallyHidden}>
        {assertive && <p key={assertive.n}>{assertive.text}</p>}
      </div>
    </AnnounceContext.Provider>
  );
}

export function useAnnounce() {
  const announce = useContext(AnnounceContext);
  if (!announce) throw new Error('useAnnounce must be used inside <AnnouncerProvider>');
  return announce;
}

export function AddToCart({ name, onAdd }) {
  const announce = useAnnounce();
  const [pending, setPending] = useState(false);

  const add = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onAdd();
      announce(`Added ${name} to cart`);
    } catch {
      // A failure the user must hear about now: assertive.
      announce(`Could not add ${name} to cart`, 'assertive');
    } finally {
      setPending(false);
    }
  };

  return (
    <button type="button" disabled={pending} onClick={add}>
      Add {name} to cart
    </button>
  );
}

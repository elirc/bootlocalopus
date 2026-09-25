import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';

export function useControllableState({ value, defaultValue, onChange }) {
  const [internal, setInternal] = useState(defaultValue);
  const controlled = value !== undefined;
  const state = controlled ? value : internal;

  // setState must be stable, yet see the latest state, mode and callback.
  const latest = useRef({ state, controlled, onChange });
  useLayoutEffect(() => {
    latest.current = { state, controlled, onChange };
  });

  const setState = useCallback((next) => {
    const { state: prev, controlled: isControlled, onChange: notify } = latest.current;
    const resolved = typeof next === 'function' ? next(prev) : next;
    if (Object.is(resolved, prev)) return;
    if (!isControlled) {
      setInternal(resolved);
      // Two calls in one handler must build on each other.
      latest.current = { ...latest.current, state: resolved };
    }
    notify?.(resolved);
  }, []);

  return [state, setState];
}

export function Accordion({ items, openId, defaultOpenId = null, onOpenChange }) {
  const [open, setOpen] = useControllableState({
    value: openId,
    defaultValue: defaultOpenId,
    onChange: onOpenChange,
  });
  const base = useId();

  return (
    <div>
      {items.map((item) => {
        const isOpen = open === item.id;
        const panelId = `${base}-panel-${item.id}`;
        return (
          <div key={item.id}>
            <h3>
              <button
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen((current) => (current === item.id ? null : item.id))}
              >
                {item.title}
              </button>
            </h3>
            {isOpen && (
              <div role="region" id={panelId} aria-label={item.title}>
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

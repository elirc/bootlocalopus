import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export function useControllableState({ value, defaultValue, onChange }) {
  // Two sources of truth: a copy of the prop, synced after the fact.
  const [state, setState] = useState(value ?? defaultValue);
  useEffect(() => {
    if (value !== undefined) setState(value);
  }, [value]);

  // TODO: controlled mode must not change anything itself; report changes.
  return [state, setState];
}

export function Accordion({ items, openId, defaultOpenId = null, onOpenChange }) {
  const [open, setOpen] = useControllableState({
    value: openId,
    defaultValue: defaultOpenId,
    onChange: onOpenChange,
  });

  return (
    <div>
      {items.map((item) => (
        <div key={item.id}>
          <h3>
            <button onClick={() => setOpen(item.id)}>{item.title}</button>
          </h3>
          {open === item.id && <div>{item.content}</div>}
        </div>
      ))}
    </div>
  );
}

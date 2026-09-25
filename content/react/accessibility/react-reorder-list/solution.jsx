import { useEffect, useRef, useState } from 'react';

export function ReorderList({ items, onChange, label }) {
  const [message, setMessage] = useState('');
  // Buttons by `${id}:up` / `${id}:down`, so focus can find the moved item's
  // button after the parent re-renders the list in its new order.
  const buttons = useRef(new Map());
  // The button to focus once the parent has applied the move.
  const pendingFocus = useRef(null);

  const move = (index, delta) => {
    const target = index + delta;
    const next = items.slice();
    [next[index], next[target]] = [next[target], next[index]];
    const item = items[index];
    // Keep focus on the same button, unless the item just reached the end it
    // was moving towards: that button is disabled now, so use the other one.
    const reachedEnd = delta < 0 ? target === 0 : target === items.length - 1;
    const same = delta < 0 ? 'up' : 'down';
    const other = delta < 0 ? 'down' : 'up';
    pendingFocus.current = `${item.id}:${reachedEnd ? other : same}`;
    setMessage(`Moved ${item.label} to position ${target + 1} of ${items.length}`);
    onChange(next);
  };

  useEffect(() => {
    if (!pendingFocus.current) return;
    const button = buttons.current.get(pendingFocus.current);
    pendingFocus.current = null;
    button?.focus();
  }, [items]);

  const register = (key) => (el) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };

  return (
    <div>
      <ul aria-label={label}>
        {items.map((item, index) => (
          <li key={item.id}>
            {item.label}
            <button
              type="button"
              ref={register(`${item.id}:up`)}
              aria-label={`Move ${item.label} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              ref={register(`${item.id}:down`)}
              aria-label={`Move ${item.label} down`}
              disabled={index === items.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
      <div role="status">{message}</div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

export function ReorderList({ items, onChange, label }) {
  // TODO: named buttons, disabled at the ends, a status message, and focus
  // that follows the moved item.
  const move = (index, delta) => {
    const next = items;
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };

  return (
    <ul aria-label={label}>
      {items.map((item, index) => (
        <li key={index}>
          {item.label}
          <button onClick={() => move(index, -1)}>↑</button>
          <button onClick={() => move(index, 1)}>↓</button>
        </li>
      ))}
    </ul>
  );
}

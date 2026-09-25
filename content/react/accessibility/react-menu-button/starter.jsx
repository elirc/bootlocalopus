import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export function MenuButton({ label, items, onSelect }) {
  const [open, setOpen] = useState(false);

  // TODO: the ARIA menu button pattern: roles and ids, focus into the menu,
  // keyboard navigation, typeahead, Escape/Tab, and closing on outside clicks.
  return (
    <div>
      <div className="trigger" onClick={() => setOpen(!open)}>
        {label}
      </div>
      {open && (
        <div className="menu">
          {items.map((item) => (
            <div key={item.id} onClick={() => onSelect(item.id)}>
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

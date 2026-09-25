import { useId, useState } from 'react';

export function Accordion({ items, allowMultiple = false }) {
  const [open, setOpen] = useState(null);

  // TODO: real buttons with aria-expanded/aria-controls, panels that stay in
  // the DOM (hidden when collapsed), unique ids, and allowMultiple.
  return (
    <div>
      {items.map((item) => (
        <div key={item.id}>
          <div className="header" onClick={() => setOpen(item.id)}>
            {item.title}
          </div>
          {open === item.id && <div>{item.content}</div>}
        </div>
      ))}
    </div>
  );
}

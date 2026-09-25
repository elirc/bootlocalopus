import { useId, useState } from 'react';

export function Accordion({ items, allowMultiple = false }) {
  // A Set of open item ids covers both modes: single mode just never lets it
  // hold more than one.
  const [openIds, setOpenIds] = useState(() => new Set());
  // Unique per accordion instance, so two accordions whose items share ids
  // still produce unique DOM ids.
  const prefix = useId();

  const toggle = (id) => {
    setOpenIds((current) => {
      if (current.has(id)) {
        const next = new Set(current);
        next.delete(id);
        return next;
      }
      return allowMultiple ? new Set(current).add(id) : new Set([id]);
    });
  };

  return (
    <div>
      {items.map((item) => {
        const open = openIds.has(item.id);
        const buttonId = `${prefix}-button-${item.id}`;
        const panelId = `${prefix}-panel-${item.id}`;
        return (
          <div key={item.id}>
            <h3>
              {/* type="button": inside a <form> a bare <button> submits it. */}
              <button
                type="button"
                id={buttonId}
                aria-expanded={open ? 'true' : 'false'}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
              >
                {item.title}
              </button>
            </h3>
            {/* Always rendered, so aria-controls resolves; `hidden` removes it
                from view and from the accessibility tree while collapsed. */}
            <div role="region" id={panelId} aria-labelledby={buttonId} hidden={!open}>
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}

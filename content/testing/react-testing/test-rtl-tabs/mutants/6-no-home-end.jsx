import { useId, useRef, useState } from 'react';

/**
 * WAI-ARIA tabs with automatic activation.
 * tabs: [{ id, label, content, disabled? }]
 */
export function Tabs({ label, tabs, defaultTab = tabs.find((t) => !t.disabled)?.id, onChange }) {
  const [selected, setSelected] = useState(defaultTab);
  const refs = useRef({});
  const base = useId();

  const select = (id) => {
    if (id === selected) return;
    setSelected(id);
    onChange?.(id);
  };

  const enabled = tabs.filter((t) => !t.disabled);

  const onKeyDown = (event) => {
    const at = enabled.findIndex((t) => t.id === selected);
    let next;
    if (event.key === 'ArrowRight') next = enabled[(at + 1) % enabled.length];
    else if (event.key === 'ArrowLeft') next = enabled[(at - 1 + enabled.length) % enabled.length];
    else return;
    event.preventDefault();
    select(next.id);
    refs.current[next.id].focus();
  };

  const current = tabs.find((t) => t.id === selected);

  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            ref={(el) => { refs.current[t.id] = el; }}
            aria-selected={t.id === selected}
            aria-controls={`${base}-panel`}
            tabIndex={t.id === selected ? 0 : -1}
            disabled={t.disabled}
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current && (
        <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${current.id}`} tabIndex={0}>
          {current.content}
        </div>
      )}
    </div>
  );
}

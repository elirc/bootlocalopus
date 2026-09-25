// Same behaviour: a list-based tablist, every panel rendered but `hidden`, panels named with aria-label,
// and keyboard handling on each tab instead of the list.
import { useEffect, useRef, useState } from 'react';

export function Tabs({ label, tabs, defaultTab, onChange }) {
  const firstEnabled = tabs.find((t) => !t.disabled)?.id;
  const [active, setActive] = useState(defaultTab ?? firstEnabled);
  const [focusTarget, setFocusTarget] = useState(null);
  const buttons = useRef(new Map());

  useEffect(() => {
    if (focusTarget !== null) {
      buttons.current.get(focusTarget.id)?.focus();
    }
  }, [focusTarget]);

  function activate(id, { focus = false } = {}) {
    if (focus) setFocusTarget({ id });
    if (id !== active) {
      setActive(id);
      if (onChange) onChange(id);
    }
  }

  function handleKey(event, index) {
    const usable = tabs.map((t, i) => ({ t, i })).filter(({ t }) => !t.disabled);
    const pos = usable.findIndex(({ i }) => i === index);
    const pick = {
      ArrowRight: () => usable[pos + 1] ?? usable[0],
      ArrowLeft: () => usable[pos - 1] ?? usable[usable.length - 1],
      Home: () => usable[0],
      End: () => usable[usable.length - 1],
    }[event.key];
    if (!pick) return;
    event.preventDefault();
    activate(pick().t.id, { focus: true });
  }

  return (
    <section>
      <ul role="tablist" aria-label={label} className="tabs">
        {tabs.map((t, index) => (
          <li key={t.id} role="presentation">
            <button
              type="button"
              role="tab"
              className={t.id === active ? 'tab tab--on' : 'tab'}
              ref={(el) => { if (el) buttons.current.set(t.id, el); else buttons.current.delete(t.id); }}
              aria-selected={t.id === active ? 'true' : 'false'}
              tabIndex={t.id === active ? 0 : -1}
              disabled={!!t.disabled}
              onClick={() => activate(t.id)}
              onKeyDown={(e) => handleKey(e, index)}
            >
              <span>{t.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {tabs.map((t) => (
        <article key={t.id} role="tabpanel" aria-label={t.label} hidden={t.id !== active} tabIndex={0}>
          {t.content}
        </article>
      ))}
    </section>
  );
}

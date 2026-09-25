import { useId, useRef, useState } from 'react';

export function Tabs({ tabs, label, activation = 'automatic' }) {
  const [selected, setSelected] = useState(tabs[0].id);
  // The tab that holds tabIndex=0. In manual mode it can differ from the
  // selected tab while the user arrows around.
  const [focusable, setFocusable] = useState(tabs[0].id);
  const buttons = useRef(new Map());
  const prefix = useId();

  const tabId = (id) => `${prefix}-tab-${id}`;
  const panelId = (id) => `${prefix}-panel-${id}`;

  const moveTo = (index) => {
    const tab = tabs[index];
    setFocusable(tab.id);
    if (activation === 'automatic') setSelected(tab.id);
    buttons.current.get(tab.id)?.focus();
  };

  const onKeyDown = (event, index) => {
    const last = tabs.length - 1;
    const target = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) return;
    // Home/End would scroll the page, arrows might scroll a container.
    event.preventDefault();
    moveTo(target);
  };

  return (
    <div>
      <div role="tablist" aria-label={label}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) buttons.current.set(tab.id, el);
              else buttons.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            aria-selected={tab.id === selected ? 'true' : 'false'}
            aria-controls={panelId(tab.id)}
            // Roving tabindex: the tablist is a single Tab stop.
            tabIndex={tab.id === focusable ? 0 : -1}
            onClick={() => {
              setSelected(tab.id);
              setFocusable(tab.id);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={panelId(tab.id)}
          aria-labelledby={tabId(tab.id)}
          tabIndex={0}
          hidden={tab.id !== selected}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}

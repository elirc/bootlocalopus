import { useState, useTransition, Suspense } from 'react';

export function TabbedView({ tabs, renderPanel, label }) {
  const [active, setActive] = useState(tabs[0].id);

  // TODO: every switch to a tab that is still loading replaces the panel
  // with "Loading…". Keep the current panel up instead, and mark the tablist
  // busy while the switch is pending.
  return (
    <div>
      <div role="tablist" aria-label={label}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <Suspense fallback={<p>Loading…</p>}>{renderPanel(active)}</Suspense>
      </div>
    </div>
  );
}

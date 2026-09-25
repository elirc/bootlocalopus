import { useState, useTransition, Suspense } from 'react';

export function TabbedView({ tabs, renderPanel, label }) {
  const [active, setActive] = useState(tabs[0].id);
  const [isPending, startTransition] = useTransition();

  const select = (id) => {
    // Marking the switch as a transition lets React keep showing the current
    // panel while the next one suspends, instead of replacing it with the
    // Suspense fallback. The first load has nothing to keep, so it still
    // shows the fallback.
    startTransition(() => setActive(id));
  };

  return (
    <div>
      <div role="tablist" aria-label={label} aria-busy={isPending ? 'true' : undefined}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => select(tab.id)}
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

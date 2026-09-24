import { createContext, useContext, useMemo, useState } from 'react';

const TabsContext = createContext(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('<Tabs.*> must be used inside <Tabs>');
  return ctx;
}

export function Tabs({ defaultValue, children }) {
  const [active, setActive] = useState(defaultValue);
  // Stable unless the selection changes, so children do not re-render for free.
  const value = useMemo(() => ({ active, setActive }), [active]);
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

Tabs.List = function TabsList({ children }) {
  useTabs();
  return <div role="tablist">{children}</div>;
};

Tabs.Tab = function TabsTab({ value, children }) {
  const { active, setActive } = useTabs();
  const selected = active === value;
  return (
    <button role="tab" aria-selected={selected} onClick={() => setActive(value)}>
      {children}
    </button>
  );
};

Tabs.Panel = function TabsPanel({ value, children }) {
  const { active } = useTabs();
  if (active !== value) return null;
  return <div role="tabpanel">{children}</div>;
};

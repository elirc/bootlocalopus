import { createContext, useContext, useMemo, useState } from 'react';

const TabsContext = createContext(null);

export function Tabs({ defaultValue, children }) {
  // TODO
  return <div>{children}</div>;
}

Tabs.List = function TabsList({ children }) {
  return null;  // TODO
};

Tabs.Tab = function TabsTab({ value, children }) {
  return null;  // TODO
};

Tabs.Panel = function TabsPanel({ value, children }) {
  return null;  // TODO
};

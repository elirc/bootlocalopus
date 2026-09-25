import { useId, useRef, useState } from 'react';

export function Tabs({ tabs, label, activation = 'automatic' }) {
  const [selected, setSelected] = useState(tabs[0].id);

  // TODO: tab roles and ids, a roving tabindex, arrow/Home/End keys, and
  // automatic vs manual activation.
  return (
    <div>
      <div>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setSelected(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.filter((tab) => tab.id === selected).map((tab) => (
        <div key={tab.id}>{tab.content}</div>
      ))}
    </div>
  );
}

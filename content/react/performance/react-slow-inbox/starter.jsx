import { createContext, memo, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';

export const renderLog = [];

const InboxContext = createContext(null);

function MessageRowImpl({ message, selected, onToggle, onArchive }) {
  renderLog.push('row:' + message.id);
  const { density } = useContext(InboxContext);
  return (
    <li data-density={density}>
      <label>
        <input type="checkbox" checked={selected} onChange={() => onToggle(message.id)} />
        {message.subject}
      </label>
      <button type="button" onClick={() => onArchive(message.id)}>
        Archive {message.subject}
      </button>
    </li>
  );
}

// TODO: every row re-renders on every keystroke, every toggle and every
// parent render. Keep the renderLog pushes as they are.
export const MessageRow = MessageRowImpl;

export function InboxApp({ messages, onArchive }) {
  renderLog.push('app');
  const [density, setDensity] = useState('comfortable');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const onToggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const needle = query.trim().toLowerCase();
  const visible = messages.filter((m) => m.subject.toLowerCase().includes(needle));

  return (
    <InboxContext.Provider value={{ density, query, setDensity }}>
      <label>
        Search
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <button
        type="button"
        aria-pressed={density === 'compact'}
        onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
      >
        Compact
      </button>
      <p role="status">{selected.size} selected</p>
      <ul aria-label="Messages">
        {visible.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            selected={selected.has(message.id)}
            onToggle={onToggle}
            onArchive={(id) => onArchive(id)}
          />
        ))}
      </ul>
    </InboxContext.Provider>
  );
}

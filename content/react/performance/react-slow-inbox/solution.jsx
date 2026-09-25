import { createContext, memo, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';

export const renderLog = [];

// Rows only need the density. A context re-renders every consumer whenever
// its value changes identity, so give them a context that holds exactly
// that: a string, which only "changes" when the density really does.
const DensityContext = createContext('comfortable');

function MessageRowImpl({ message, selected, onToggle, onArchive }) {
  renderLog.push('row:' + message.id);
  const density = useContext(DensityContext);
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

// memo skips a render when every prop is Object.is-equal to last time. That
// only pays off because InboxApp below keeps every prop stable.
export const MessageRow = memo(MessageRowImpl);

export function InboxApp({ messages, onArchive }) {
  renderLog.push('app');
  const [density, setDensity] = useState('comfortable');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  // A functional update reads the latest selection when it runs, so the
  // callback closes over nothing and never needs to change.
  const onToggle = useCallback((id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // The parent passes onArchive inline, so it is a new function on every
  // render. Keep the latest one in a ref and hand the rows a stable wrapper
  // that calls it: stable identity, never stale.
  const onArchiveRef = useRef(onArchive);
  useLayoutEffect(() => {
    onArchiveRef.current = onArchive;
  });
  const archive = useCallback((id) => onArchiveRef.current(id), []);

  // Cheap for an inbox page; the rows keep their identity because the
  // message objects do, so no useMemo is needed here.
  const needle = query.trim().toLowerCase();
  const visible = messages.filter((m) => m.subject.toLowerCase().includes(needle));

  return (
    <DensityContext.Provider value={density}>
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
            onArchive={archive}
          />
        ))}
      </ul>
    </DensityContext.Provider>
  );
}

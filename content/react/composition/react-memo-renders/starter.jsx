import { useState, memo, useCallback, useMemo } from 'react';

export const renderLog = [];

function ExpensiveRowImpl({ item, onSelect, selected }) {
  renderLog.push('row:' + item.id);
  return (
    <li>
      {item.name}{selected ? ' (selected)' : ''}
      <button onClick={() => onSelect(item.id)}>Select {item.name}</button>
    </li>
  );
}

// TODO: this is not memoised
export const ExpensiveRow = ExpensiveRowImpl;

// Already memoised. It can only skip a render if `rows` keeps its identity.
export const Summary = memo(function Summary({ rows }) {
  renderLog.push('summary');
  return <p>Showing {rows.length}</p>;
});

export function Board({ items }) {
  renderLog.push('board');
  const [counter, setCounter] = useState(0);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('');

  // TODO: a new function every render defeats memo
  const onSelect = (id) => setSelected(id);

  // TODO: a new array every render
  const visible = items.filter((item) => item.name.includes(filter));

  return (
    <div>
      <button onClick={() => setCounter((c) => c + 1)}>Bump {counter}</button>
      <label htmlFor="filter">Filter</label>
      <input id="filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul>
        {visible.map((item) => (
          <ExpensiveRow key={item.id} item={item} onSelect={onSelect} selected={selected === item.id} />
        ))}
      </ul>
      <Summary rows={visible} />
    </div>
  );
}

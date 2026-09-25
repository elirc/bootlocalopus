import { useId, useMemo, useState } from 'react';

const compareValues = (a, b, type) =>
  type === 'number' ? a - b : String(a).localeCompare(String(b), 'en', { sensitivity: 'base' });

/**
 * columns: [{ key, label, type: 'text' | 'number' }], rows: [{ id, ...values }]
 * Click a header to sort ascending, again for descending. Ties keep their original order.
 */
export function SortableTable({ columns, rows }) {
  const [sort, setSort] = useState(null); // { key, dir: 'ascending' | 'descending' }
  const [filter, setFilter] = useState('');
  const filterId = useId();

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matching = needle
      ? rows.filter((row) => columns.some((c) => c.type === 'text' && String(row[c.key]).toLowerCase().includes(needle)))
      : rows;
    if (!sort) return matching;
    const column = columns.find((c) => c.key === sort.key);
    const sign = sort.dir === 'ascending' ? 1 : -1;
    return matching
      .map((row, index) => ({ row, index }))
      .sort((a, b) => sign * compareValues(a.row[sort.key], b.row[sort.key], column.type) || a.index - b.index)
      .map(({ row }) => row);
  }, [rows, columns, sort, filter]);

  const toggle = (key) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 'ascending' ? 'descending' : 'ascending' } : { key, dir: prev?.dir ?? 'ascending' }));

  return (
    <div>
      <label htmlFor={filterId}>Filter</label>
      <input id={filterId} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <p role="status">Showing {visible.length} of {rows.length}</p>
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} aria-sort={sort?.key === c.key ? sort.dir : undefined}>
                <button type="button" onClick={() => toggle(c.key)}>{c.label}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr><td colSpan={columns.length}>No matching rows</td></tr>
          ) : (
            visible.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => <td key={c.key}>{row[c.key]}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

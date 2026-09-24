import { useState, useMemo } from 'react';

export function DataTable({ rows, columns, pageSize = 3 }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: null, direction: 'asc' });
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      columns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(needle)),
    );
  }, [rows, columns, search]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    // Copy first: sort() mutates, and `filtered` may be the caller's array.
    const copy = [...filtered];
    copy.sort((left, right) => {
      const a = left[sort.key];
      const b = right[sort.key];
      const order = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b));
      return sort.direction === 'asc' ? order : -order;
    });
    return copy;
  }, [filtered, sort]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  const toggleSort = (key) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
    setPage(1);
  };

  const onSearch = (event) => {
    setSearch(event.target.value);
    setPage(1);
  };

  return (
    <div>
      <label htmlFor="table-search">Search</label>
      <input id="table-search" value={search} onChange={onSearch} />

      <table>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort.key === column.key;
              return (
                <th
                  key={column.key}
                  aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.sortable
                    ? <button onClick={() => toggleSort(column.key)}>{column.label}</button>
                    : column.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => <td key={column.key}>{String(row[column.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

      {total === 0 && <p>No results</p>}

      <p role="status">
        {total === 0
          ? 'Showing 0 of 0'
          : 'Showing ' + (start + 1) + '–' + Math.min(start + pageSize, total) + ' of ' + total}
      </p>

      <button onClick={() => setPage((p) => p - 1)} disabled={currentPage <= 1}>Previous</button>
      <button onClick={() => setPage((p) => p + 1)} disabled={currentPage >= totalPages}>Next</button>
    </div>
  );
}

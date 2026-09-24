import { useState, useMemo } from 'react';

export function DataTable({ rows, columns, pageSize = 3 }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: null, direction: 'asc' });
  const [page, setPage] = useState(1);

  // TODO: filter -> sort -> paginate, all derived
  return null;
}

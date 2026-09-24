The chapter's boss: one component, four interacting pieces of state, and a
derived pipeline that must stay in the right order.

## Task

Export `DataTable({ rows, columns, pageSize = 3 })`.
`columns` is `[{ key, label, sortable }]`.

**Structure**

- a `<table>` with a `<th>` per column. Sortable columns' headers are
  `<button>`s labelled with the column label.
- `aria-sort` on the sorted `<th>`: `'ascending'` or `'descending'`; absent
  on the others.
- a search box labelled `Search`
- `<tbody>` holds only the current page's rows
- a status line ````Showing 1–3 of 7```` (en dash) in an element with
  `role="status"`
- `Previous` and `Next` buttons, disabled at the ends

**Behaviour**

1. Search filters across **all** column values, case-insensitively.
2. Clicking a sortable header sorts ascending; clicking the same one again
   flips to descending. Sorting by a new column starts ascending again.
3. Strings sort with `localeCompare`; numbers sort numerically.
4. The pipeline order is filter → sort → paginate.
5. Changing the search resets to page 1. So does changing the sort.
6. With no matching rows: no `<tbody>` rows, and `No results` shown.

Derive everything you can; only `search`, `sort` and `page` are state.
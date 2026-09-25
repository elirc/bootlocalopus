```ts
const columns: Column<Order>[] = [
  { key: 'total', header: 'Total', format: (v) => v.toFixed(2) },
  //                                              ^ Property 'toFixed' does not exist on type 'string | number | Date | …'
];
```

Tables, CSV exports, admin screens and form builders all take a list of
column (or field) definitions, and each one has a callback whose argument
should be *that column's* value. The first attempt types the column once:

```ts
type Column<Row> = { key: keyof Row; format?: (value: Row[keyof Row]) => string };
```

and every `format` receives the union of every value type in the row. Callers
cast, and a formatter written for one column can be attached to another.

What you want is **one object type per key**, then the union of them:

```ts
{ key: 'total'; format?: (value: number, row: Order) => string }
| { key: 'createdAt'; format?: (value: Date, row: Order) => string }
| …
```

Build it with a mapped type over the keys, then index it with the keys. Once
the column type is a union discriminated by `key`, TypeScript picks the right
member for each object literal and types `format`'s parameter from it — no
annotations at the call site.

The second trap is *consuming* that union. Inside `renderCell`, `column.key`
and `column.format` are both unions, and TypeScript does not know they belong
together, so `column.format(row[column.key], row)` fails to compile. The fix is
to make the function **generic in the key** and to define the single-key
column as the mapped type indexed by that generic `K` — TypeScript then keeps
`key: K` and `format: (value: Row[K], …)` related.

## Task

Export:

- **`Column<Row, K>`** — the column definition for key `K` of `Row`:
  `{ key: K; header: string; align?: 'left' | 'right'; format?: (value: Row[K], row: Row) => string }`.
  `K` defaults to every string key of `Row`, and then `Column<Row>` is the
  **union** of the per-key columns.
- **`defineColumns<Row>(columns)`** — returns `columns` unchanged; callers
  write `defineColumns<Order>([…])` and get each `format` contextually typed.
  A column for a key `Row` lacks, a `format` that returns a non-string, a
  missing `header` or an unknown `align` are compile errors.
- **`renderCell(row, column)`** — `column.format(value, row)` if there is a
  formatter, else `String(value)`.
- **`renderRows(rows, columns)`** — `string[][]`, one array of cells per row.
- **`renderHeader(columns)`** — the headers.

Columns defined for one row type must be rejected for another.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.

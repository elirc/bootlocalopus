/** One column definition per key of Row, each typed from that key's value. */
export type ColumnMap<Row> = {
  [K in keyof Row & string]: {
    key: K;
    header: string;
    align?: 'left' | 'right';
    format?: (value: Row[K], row: Row) => string;
  };
};

/**
 * `Column<Row>` (no K) is the union of every column; `Column<Row, K>` is the
 * column for one key. Indexing the map with a generic K is what lets
 * TypeScript relate `column.key` and `column.format` to the same K.
 */
export type Column<Row, K extends keyof Row & string = keyof Row & string> = ColumnMap<Row>[K];

/** Identity at runtime; exists so callers name Row once and get checked, contextually typed columns. */
export function defineColumns<Row>(columns: readonly Column<Row>[]): readonly Column<Row>[] {
  return columns;
}

export function renderCell<Row, K extends keyof Row & string>(row: Row, column: Column<Row, K>): string {
  const value = row[column.key];
  return column.format ? column.format(value, row) : String(value);
}

export function renderRows<Row>(rows: readonly Row[], columns: readonly Column<Row>[]): string[][] {
  return rows.map((row) => columns.map((column) => renderCell(row, column)));
}

export function renderHeader<Row>(columns: readonly Column<Row>[]): string[] {
  return columns.map((column) => column.header);
}

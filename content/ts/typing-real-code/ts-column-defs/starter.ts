// One column type for every key: `format` receives the union of ALL value
// types (string | number | Date | …), so every formatter has to narrow or cast,
// and a formatter for the wrong column compiles.

export type Column<Row, K extends keyof Row & string = keyof Row & string> = {
  key: K;
  header: string;
  align?: 'left' | 'right';
  format?: (value: Row[keyof Row], row: Row) => string;
};

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

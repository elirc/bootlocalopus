import { defineColumns, renderRows, renderCell, renderHeader } from './solution';
import type { Column } from './solution';

interface Order {
  id: string;
  total: number;
  createdAt: Date;
  customer: { name: string };
  paid: boolean;
}
interface User { id: string; email: string }
declare const orders: Order[];
declare const users: User[];

// --- each column's format is typed from its own key, with no annotations
const columns = defineColumns<Order>([
  { key: 'id', header: 'ID' },
  { key: 'total', header: 'Total', align: 'right', format: (total) => total.toFixed(2) },
  { key: 'createdAt', header: 'Created', format: (date) => date.toISOString().slice(0, 10) },
  { key: 'customer', header: 'Customer', format: (customer, row) => `${customer.name} (${row.id})` },
  {
    key: 'paid',
    header: 'Paid',
    format: (paid) => {
      type _paid = Expect<Equal<typeof paid, boolean>>;
      return paid ? 'yes' : 'no';
    },
  },
]);

// @ts-expect-error id is a string: no toFixed
defineColumns<Order>([{ key: 'id', header: 'ID', format: (id) => id.toFixed(2) }]);
// @ts-expect-error not a key of Order
defineColumns<Order>([{ key: 'amount', header: 'Amount' }]);
// @ts-expect-error format must return a string
defineColumns<Order>([{ key: 'total', header: 'Total', format: (total) => total }]);
// @ts-expect-error a header is required
defineColumns<Order>([{ key: 'total' }]);
// @ts-expect-error align is left or right
defineColumns<Order>([{ key: 'total', header: 'Total', align: 'center' }]);

// --- the types themselves
type TotalColumn = Column<Order, 'total'>;
type _totalKey = Expect<Equal<TotalColumn['key'], 'total'>>;
type _totalFormat = Expect<Equal<Parameters<NonNullable<TotalColumn['format']>>, [value: number, row: Order]>>;
type _union = Expect<Equal<Column<Order>['key'], 'id' | 'total' | 'createdAt' | 'customer' | 'paid'>>;
type _dateCol = Expect<Equal<Parameters<NonNullable<Extract<Column<Order>, { key: 'createdAt' }>['format']>>[0], Date>>;

// --- rendering
const cells: string[][] = renderRows(orders, columns);
const header: string[] = renderHeader(columns);
const one: string = renderCell(orders[0], { key: 'total', header: 'Total', format: (t) => t.toFixed(0) });
// @ts-expect-error these columns are for orders, not users
renderRows(users, columns);
// @ts-expect-error a column for a key the row does not have
renderCell(users[0], { key: 'total', header: 'Total' });

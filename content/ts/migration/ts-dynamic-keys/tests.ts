import { STATUS_LABELS, isStatus, statusLabel, countByStatus, getField, sortBy } from './solution';
import type { Status, Order, SortKey } from './solution';

// ---------- Status is derived from the labels ----------
type _st = Expect<Equal<Status, 'open' | 'paid' | 'shipped'>>;
type _lbl = Expect<Equal<(typeof STATUS_LABELS)['paid'], 'Paid'>>;

// ---------- isStatus narrows a string from outside ----------
declare const fromUrl: string;
if (isStatus(fromUrl)) {
  type _n = Expect<Equal<typeof fromUrl, Status>>;
  const label: 'Open' | 'Paid' | 'Shipped' = STATUS_LABELS[fromUrl];
}
// @ts-expect-error an arbitrary string is not a Status
const s: Status = fromUrl;

// ---------- statusLabel admits the miss ----------
type _sl = Expect<Equal<ReturnType<typeof statusLabel>, string | undefined>>;
// @ts-expect-error the label may be undefined
statusLabel(fromUrl).toUpperCase();

// ---------- countByStatus has every key ----------
declare const orders: Order[];
const counts = countByStatus(orders);
type _c = Expect<Equal<typeof counts, Record<Status, number>>>;
const openCount: number = counts.open;
// @ts-expect-error not a status
counts.cancelled;

// ---------- getField ----------
declare const order: Order;
const when = getField(order, 'placedAt');
type _g1 = Expect<Equal<typeof when, Date>>;
const tags = getField(order, 'tags');
type _g2 = Expect<Equal<typeof tags, string[]>>;
// @ts-expect-error not a field of Order
getField(order, 'price');

// ---------- sortBy only takes comparable fields ----------
type _sk = Expect<Equal<SortKey, 'id' | 'status' | 'totalCents'>>;
sortBy(orders, 'totalCents');
sortBy(orders, 'status');
// @ts-expect-error a Date field is not a SortKey
sortBy(orders, 'placedAt');
// @ts-expect-error an array field is not a SortKey
sortBy(orders, 'tags');
const sorted = sortBy(orders, 'id');
type _so = Expect<Equal<typeof sorted, Order[]>>;

// ---------- no any leaked ----------
type _na1 = ExpectFalse<IsAny<ReturnType<typeof getField>>>;
type _na2 = ExpectFalse<IsAny<typeof counts>>;

import { sortBy, sumBy, indexBy } from './solution';
import type { KeysMatching } from './solution';

interface Order {
  id: string;
  seq: number;
  total: number;
  createdAt: Date;
  paid: boolean;
  note?: string;
  discount?: number;
  customer: { name: string };
  tags: string[];
}
declare const orders: Order[];

// --- KeysMatching picks keys by their value type
type _num = Expect<Equal<KeysMatching<Order, number>, 'seq' | 'total'>>;
type _str = Expect<Equal<KeysMatching<Order, string>, 'id'>>;
type _date = Expect<Equal<KeysMatching<Order, Date>, 'createdAt'>>;
type _bool = Expect<Equal<KeysMatching<Order, boolean>, 'paid'>>;
// An optional key only matches when the target type allows undefined.
type _optional = Expect<Equal<KeysMatching<Order, string | undefined>, 'id' | 'note'>>;
type _optNum = Expect<Equal<KeysMatching<Order, number | undefined>, 'seq' | 'total' | 'discount'>>;
type _none = Expect<Equal<KeysMatching<{ a: string; b?: boolean }, number>, never>>;
type _allOptional = Expect<Equal<KeysMatching<{ a?: number; b?: number }, number>, never>>;

// --- sortBy: only keys whose values can be ordered
const byTotal = sortBy(orders, 'total');
type _sorted = Expect<Equal<typeof byTotal, Order[]>>;
sortBy(orders, 'id', 'desc');
sortBy(orders, 'createdAt');
// @ts-expect-error objects have no order
sortBy(orders, 'customer');
// @ts-expect-error nor do arrays
sortBy(orders, 'tags');
// @ts-expect-error nor booleans, in this API
sortBy(orders, 'paid');
// @ts-expect-error an optional key can be undefined, which does not sort
sortBy(orders, 'note');
// @ts-expect-error not a key at all
sortBy(orders, 'amount');
// @ts-expect-error direction is 'asc' | 'desc'
sortBy(orders, 'total', 'up');

declare const frozen: readonly Order[];
const fromFrozen = sortBy(frozen, 'seq');
type _frozen = Expect<Equal<typeof fromFrozen, Order[]>>;

// --- sumBy: only numeric keys
const revenue = sumBy(orders, 'total');
type _revenue = Expect<Equal<typeof revenue, number>>;
// @ts-expect-error a string key would concatenate
sumBy(orders, 'id');
// @ts-expect-error an optional number can be undefined, and NaN poisons the sum
sumBy(orders, 'discount');

// --- indexBy: keys usable as Map keys, and the Map remembers the key's type
const byId = indexBy(orders, 'id');
type _byId = Expect<Equal<typeof byId, Map<string, Order>>>;
const bySeq = indexBy(orders, 'seq');
type _bySeq = Expect<Equal<typeof bySeq, Map<number, Order>>>;
// @ts-expect-error a Date is not a sensible key
indexBy(orders, 'createdAt');
// @ts-expect-error an optional key would index undefined
indexBy(orders, 'note');

// Works for any shape, not just Order.
const people = [{ email: 'a@x.io', age: 30 }, { email: 'b@x.io', age: 41 }];
const byEmail = indexBy(people, 'email');
type _byEmail = Expect<Equal<typeof byEmail, Map<string, { email: string; age: number }>>>;
const ages: number = sumBy(people, 'age');

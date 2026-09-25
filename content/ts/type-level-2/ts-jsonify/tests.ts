import { roundTrip } from './solution';
import type { Json, Jsonify } from './solution';

// --- Json ---
const okJson: Json = { a: [1, 'two', true, null, { b: [] }] };
// @ts-expect-error a Date is not JSON
const badDate: Json = { at: new Date() };
// @ts-expect-error undefined is not JSON
const badUndef: Json = [undefined];
// @ts-expect-error a function is not JSON
const badFn: Json = { f: () => 1 };

// --- primitives and toJSON ---
type _str = Expect<Equal<Jsonify<string>, string>>;
type _lit = Expect<Equal<Jsonify<'draft' | 'live'>, 'draft' | 'live'>>;
type _num = Expect<Equal<Jsonify<42>, 42>>;
type _null = Expect<Equal<Jsonify<null>, null>>;
type _date = Expect<Equal<Jsonify<Date>, string>>;
type _dateOrNull = Expect<Equal<Jsonify<Date | null>, string | null>>;
type _toJson = Expect<Equal<Jsonify<{ toJSON(): { at: Date } }>, { at: string }>>;
type _fnTop = Expect<Equal<Jsonify<() => void>, never>>;
type _bigint = Expect<Equal<Jsonify<bigint>, never>>;

// --- arrays ---
type _arr = Expect<Equal<Jsonify<Date[]>, string[]>>;
type _arrHoles = Expect<Equal<Jsonify<(number | undefined)[]>, (number | null)[]>>;
type _arrFns = Expect<Equal<Jsonify<Array<() => void>>, null[]>>;
type _arrRo = Expect<Equal<Jsonify<readonly string[]>, string[]>>;
type _arrNested = Expect<Equal<Jsonify<Date[][]>, string[][]>>;

// --- objects ---
interface Order {
  id: number;
  status: 'open' | 'paid';
  placedAt: Date;
  note?: string;
  paidAt?: Date;
  lines: { sku: string; qty: number; addedAt: Date }[];
  customer: { name: string; lastSeen: Date | null; greet(): string };
  total(): number;
  onChange?: () => void;
  debug: undefined;
}

type OrderDto = Jsonify<Order>;
type _order = Expect<Equal<OrderDto, {
  id: number;
  status: 'open' | 'paid';
  placedAt: string;
  note?: string;
  paidAt?: string;
  lines: { sku: string; qty: number; addedAt: string }[];
  customer: { name: string; lastSeen: string | null };
}>>;

type _symbolKey = Expect<Equal<Jsonify<{ a: 1; [Symbol.iterator]: number }>, { a: 1 }>>;
type _record = Expect<Equal<Jsonify<Record<string, Date>>, { [x: string]: string }>>;
type _nestedDeep = Expect<Equal<Jsonify<{ a: { b: { c: Date; d: () => void } } }>, { a: { b: { c: string } } }>>;
type _union = Expect<Equal<Jsonify<{ kind: 'a'; at: Date } | { kind: 'b' }>, { kind: 'a'; at: string } | { kind: 'b' }>>;

// --- the DTO really is JSON ---
type _isJson = Expect<OrderDto extends Json ? true : false>;

// --- roundTrip ---
declare const order: Order;
const dto = roundTrip(order);
type _rt = Expect<Equal<typeof dto, OrderDto>>;
const placed: string = dto.placedAt;
// @ts-expect-error methods do not survive the trip
dto.total();
// @ts-expect-error a Date became a string
dto.placedAt.getTime();

import { isRecord, hasKey, hasKeyOf, isArrayOf, isOneOf, nullable, isString, isNumber } from './solution';
import type { Guard } from './solution';

declare const input: unknown;

// ---------- isRecord ----------
if (isRecord(input)) {
  const v: unknown = input.anything;
  type _r = Expect<Equal<typeof input, Record<string, unknown>>>;
}
// @ts-expect-error unknown cannot be indexed before narrowing
input.anything;

// ---------- hasKey ----------
if (hasKey(input, 'id')) {
  type _h1 = Expect<Equal<typeof input, Record<'id', unknown>>>;
  const id: unknown = input.id;
  // @ts-expect-error only the checked key is known
  input.name;
}
if (hasKey(input, 'id') && hasKey(input, 'name')) {
  const both: { id: unknown; name: unknown } = input;
}

// ---------- hasKeyOf ----------
if (hasKeyOf(input, 'email', isString)) {
  type _k1 = Expect<Equal<typeof input, Record<'email', string>>>;
  const lower: string = input.email.toLowerCase();
}
if (hasKeyOf(input, 'id', isNumber) && hasKeyOf(input, 'email', isString)) {
  const user: { id: number; email: string } = input;
}
declare const partlyKnown: { source: 'web' };
if (hasKeyOf(partlyKnown, 'retries', isNumber)) {
  // narrowing keeps what was already known
  const src: 'web' = partlyKnown.source;
  const r: number = partlyKnown.retries;
}

// ---------- isArrayOf ----------
const isStrings = isArrayOf(isString);
type _a1 = Expect<Equal<typeof isStrings, Guard<string[]>>>;
if (isStrings(input)) {
  const joined: string = input.join(',');
  // @ts-expect-error elements are strings
  const bad: number[] = input;
}
const isMatrix = isArrayOf(isArrayOf(isNumber));
if (isMatrix(input)) {
  type _a2 = Expect<Equal<typeof input, number[][]>>;
}

// ---------- isOneOf ----------
const isStatus = isOneOf('open', 'paid', 'void');
type _o1 = Expect<Equal<typeof isStatus, Guard<'open' | 'paid' | 'void'>>>;
if (isStatus(input)) {
  type _o2 = Expect<Equal<typeof input, 'open' | 'paid' | 'void'>>;
}
// @ts-expect-error only strings are allowed
isOneOf('a', 1);

// ---------- nullable ----------
const maybeNote = nullable(isString);
type _n1 = Expect<Equal<typeof maybeNote, Guard<string | null>>>;
if (hasKeyOf(input, 'note', nullable(isString))) {
  type _n2 = Expect<Equal<typeof input.note, string | null>>;
}

// ---------- composing a real check ----------
interface Order { id: string; status: 'open' | 'paid'; lines: string[]; coupon: string | null }
function isOrder(value: unknown): value is Order {
  return hasKeyOf(value, 'id', isString)
    && hasKeyOf(value, 'status', isOneOf('open', 'paid'))
    && hasKeyOf(value, 'lines', isArrayOf(isString))
    && hasKeyOf(value, 'coupon', nullable(isString));
}
function isOrderWrong(value: unknown): value is Order {
  // @ts-expect-error a guard for the wrong type cannot be passed off as this one
  const check: Guard<Order> = isArrayOf(isString);
  return check(value);
}

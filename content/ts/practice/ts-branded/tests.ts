import { userId, orderId, isUserId, assertUserId, cents, addCents, multiplyCents, sumCents } from './solution';
import type { UserId, OrderId, Cents } from './solution';

// The brands are real, distinct types — not aliases, not any.
type _userNotAny = ExpectFalse<IsAny<UserId>>;
type _centsNotAny = ExpectFalse<IsAny<Cents>>;
type _userNotString = ExpectFalse<Equal<UserId, string>>;
type _userNotOrder = ExpectFalse<Equal<UserId, OrderId>>;
type _centsNotNumber = ExpectFalse<Equal<Cents, number>>;

// Constructors return the brand.
type _mkUser = Expect<Equal<ReturnType<typeof userId>, UserId>>;
type _mkOrder = Expect<Equal<ReturnType<typeof orderId>, OrderId>>;
type _mkCents = Expect<Equal<ReturnType<typeof cents>, Cents>>;
type _userParam = Expect<Equal<Parameters<typeof userId>[0], string>>;

declare function loadUser(id: UserId): void;
declare function loadOrder(id: OrderId): void;
declare function charge(amount: Cents): void;

const u = userId('usr_ab12cd34');
const o = orderId('ord_ab12cd34');
loadUser(u);
loadOrder(o);

// Mixing ids is the bug brands exist to catch.
// @ts-expect-error an OrderId is not a UserId
loadUser(o);
// @ts-expect-error a UserId is not an OrderId
loadOrder(u);
// @ts-expect-error a raw string is not a UserId
loadUser('usr_ab12cd34');
// @ts-expect-error you cannot declare your way to a brand
const forged: UserId = 'usr_ab12cd34';
// @ts-expect-error userId validates strings, not numbers
userId(42);

// A branded id is still a string everywhere a string is wanted.
const asText: string = u;
const upper: string = u.toUpperCase();

// Narrowing: a type predicate and an assertion function.
declare const header: string;
if (isUserId(header)) {
  loadUser(header);
} else {
  // @ts-expect-error not narrowed in the else branch
  loadUser(header);
}
declare const fromJson: unknown;
assertUserId(fromJson);
loadUser(fromJson);
type _asserted = Expect<Equal<typeof fromJson, UserId>>;

// Money: helpers keep the brand through arithmetic.
const price = cents(1999);
const shipping = cents(499);
const subtotal = addCents(price, shipping);
type _add = Expect<Equal<typeof subtotal, Cents>>;
const threeOf = multiplyCents(price, 3);
type _mul = Expect<Equal<typeof threeOf, Cents>>;
const total = sumCents([price, shipping, threeOf]);
type _sum = Expect<Equal<typeof total, Cents>>;
charge(total);
const readonlyTotal = sumCents([price, shipping] as const);
charge(readonlyTotal);

// Cents is still a number for display and comparison.
const asNumber: number = total;
const isBig: boolean = total > 10_000;

// Plain arithmetic drops the brand — which is the point of the helpers.
// @ts-expect-error number + number is a number, not Cents
const lost: Cents = price + shipping;
// @ts-expect-error a bare number is not Cents
addCents(price, 499);
// @ts-expect-error ids are not money
addCents(price, u);
// @ts-expect-error raw numbers are not Cents
sumCents([1999, 499]);
// @ts-expect-error charge wants Cents
charge(1999);

// Today every id is a `string` and every amount is a `number`, so
// `refund(order.customerId, order.id)` compiles with the arguments swapped.

export type UserId = string;  // TODO: brand it
export type OrderId = string; // TODO: brand it
export type Cents = number;   // TODO: brand it

const USER_ID = /^usr_[a-z0-9]{8}$/;
const ORDER_ID = /^ord_[a-z0-9]{8}$/;

export function isUserId(value: unknown): boolean {
  return typeof value === 'string' && USER_ID.test(value);
}

export function assertUserId(value: unknown): void {
  if (!isUserId(value)) throw new TypeError(`not a user id: ${String(value)}`);
}

export function userId(raw: string): UserId {
  assertUserId(raw);
  return raw;
}

export function orderId(raw: string): OrderId {
  if (!ORDER_ID.test(raw)) throw new TypeError(`not an order id: ${raw}`);
  return raw;
}

export function cents(amount: number): Cents {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`cents must be an integer, got ${amount}`);
  return amount;
}

export function addCents(a: Cents, b: Cents): Cents {
  return a + b;
}

export function multiplyCents(amount: Cents, factor: number): Cents {
  const raw = amount * factor;
  return Math.sign(raw) * Math.round(Math.abs(raw));
}

export function sumCents(amounts: Cents[]): Cents {
  return amounts.reduce(addCents, 0);
}

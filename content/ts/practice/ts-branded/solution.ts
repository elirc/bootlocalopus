declare const brand: unique symbol;

/** A `T` that carries a compile-time-only tag. Nothing exists at runtime. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Brand<string, 'UserId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type Cents = Brand<number, 'Cents'>;

const USER_ID = /^usr_[a-z0-9]{8}$/;
const ORDER_ID = /^ord_[a-z0-9]{8}$/;

export function isUserId(value: unknown): value is UserId {
  return typeof value === 'string' && USER_ID.test(value);
}

export function assertUserId(value: unknown): asserts value is UserId {
  if (!isUserId(value)) throw new TypeError(`not a user id: ${String(value)}`);
}

export function userId(raw: string): UserId {
  assertUserId(raw);
  return raw;
}

export function orderId(raw: string): OrderId {
  if (!ORDER_ID.test(raw)) throw new TypeError(`not an order id: ${raw}`);
  return raw as OrderId;
}

export function cents(amount: number): Cents {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`cents must be an integer, got ${amount}`);
  return amount as Cents;
}

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

/** Multiply by a plain factor (a quantity, a tax rate) and round half away from zero. */
export function multiplyCents(amount: Cents, factor: number): Cents {
  const raw = amount * factor;
  return cents(Math.sign(raw) * Math.round(Math.abs(raw)));
}

export function sumCents(amounts: readonly Cents[]): Cents {
  return amounts.reduce(addCents, cents(0));
}

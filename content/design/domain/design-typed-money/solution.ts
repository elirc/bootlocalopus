export type Currency = 'GBP' | 'USD' | 'EUR' | 'JPY';

/** The currency lives in the type as well as the value. */
export interface Money<C extends Currency> {
  readonly amountMinor: number;
  readonly currency: C;
}

export interface Rate<From extends Currency, To extends Currency> {
  readonly from: From;
  readonly to: To;
  readonly multiplier: number;
}

/** At least one element, as far as the compiler can see. */
export type NonEmptyArray<T> = readonly [T, ...T[]];

export function money<C extends Currency>(amountMinor: number, currency: C): Money<C> {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError('amountMinor must be an integer');
  return Object.freeze({ amountMinor, currency });
}

// NoInfer: C is decided by the first argument only, so a second currency is an
// error instead of being merged into a union.
export function add<C extends Currency>(a: Money<C>, b: Money<NoInfer<C>>): Money<C> {
  if (a.currency !== b.currency) throw new Error(`Cannot add ${a.currency} to ${b.currency}`);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function sum<C extends Currency>(currency: C, items: readonly Money<NoInfer<C>>[]): Money<C> {
  return items.reduce<Money<C>>((total, item) => add(total, item), money(0, currency));
}

export function rate<From extends Currency, To extends Currency>(from: From, to: To, multiplier: number): Rate<From, To> {
  return Object.freeze({ from, to, multiplier });
}

export function convert<From extends Currency, To extends Currency>(m: Money<From>, r: Rate<NoInfer<From>, To>): Money<To> {
  if (m.currency !== r.from) throw new Error(`Rate is for ${r.from}, not ${m.currency}`);
  return money(Math.round(m.amountMinor * r.multiplier), r.to);
}

/** One Money per ratio, so `const [a, b] = allocate(m, [1, 1])` is exactly two parts. */
export function allocate<C extends Currency, R extends NonEmptyArray<number>>(
  m: Money<C>,
  ratios: R,
): { -readonly [K in keyof R]: Money<C> } {
  const total = ratios.reduce((a, b) => a + b, 0);
  const shares = ratios.map((r, index) => {
    const n = m.amountMinor * r;
    return { index, base: Math.floor(n / total), rem: n % total };
  });
  let left = m.amountMinor - shares.reduce((a, s) => a + s.base, 0);
  for (const s of [...shares].sort((a, b) => b.rem - a.rem || a.index - b.index)) {
    if (left-- <= 0) break;
    s.base += 1;
  }
  return shares.map((s) => money(s.base, m.currency)) as { -readonly [K in keyof R]: Money<C> };
}

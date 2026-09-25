export type Currency = 'GBP' | 'USD' | 'EUR' | 'JPY';

// TODO: put the currency in the type, so pounds and dollars cannot mix.
export interface Money<C = string> {
  amountMinor: number;
  currency: string;
}

// TODO
export interface Rate<From = string, To = string> {
  from: string;
  to: string;
  multiplier: number;
}

// TODO: at least one element, as far as the compiler can see.
export type NonEmptyArray<T> = T[];

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError('amountMinor must be an integer');
  return Object.freeze({ amountMinor, currency });
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`Cannot add ${a.currency} to ${b.currency}`);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function sum(currency: string, items: readonly Money[]): Money {
  return items.reduce((total, item) => add(total, item), money(0, currency));
}

export function rate(from: string, to: string, multiplier: number): Rate {
  return Object.freeze({ from, to, multiplier });
}

export function convert(m: Money, r: Rate): Money {
  if (m.currency !== r.from) throw new Error(`Rate is for ${r.from}, not ${m.currency}`);
  return money(Math.round(m.amountMinor * r.multiplier), r.to);
}

export function allocate(m: Money, ratios: readonly number[]): Money[] {
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
  return shares.map((s) => money(s.base, m.currency));
}

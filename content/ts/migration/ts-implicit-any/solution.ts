export type Currency = 'GBP' | 'EUR' | 'USD';

const SYMBOLS: Record<Currency, string> = { GBP: '£', EUR: '€', USD: '$' };

export function formatMoney(cents: number, currency: Currency = 'GBP'): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}${SYMBOLS[currency]}${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function sumBy<T>(items: readonly T[], amount: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += amount(item);
  return total;
}

/** Partial: a key that no item produced is absent, not an empty array. */
export function groupBy<T, K extends PropertyKey>(items: readonly T[], keyOf: (item: T) => K): Partial<Record<K, T[]>> {
  const groups: Partial<Record<K, T[]>> = {};
  for (const item of items) {
    const key = keyOf(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = obj[key];
  return out;
}

/** Runs `fn` the first time only; later calls return the first result. */
export function once<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let result: { value: R } | undefined;
  return (...args) => {
    result ??= { value: fn(...args) };
    return result.value;
  };
}

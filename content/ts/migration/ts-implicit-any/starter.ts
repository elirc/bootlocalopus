// utils.ts, renamed from utils.js. With `noImplicitAny` on (it is part of
// `strict`), every parameter below is an error. Type them; keep the bodies'
// behaviour.

const SYMBOLS = { GBP: '£', EUR: '€', USD: '$' };

export function formatMoney(cents, currency = 'GBP') {
  const sign = cents < 0 ? '-' : '';
  return `${sign}${SYMBOLS[currency]}${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function sumBy(items, amount) {
  let total = 0;
  for (const item of items) total += amount(item);
  return total;
}

export function groupBy(items, keyOf) {
  const groups = {};
  for (const item of items) {
    const key = keyOf(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}

export function pick(obj, keys) {
  const out = {};
  for (const key of keys) out[key] = obj[key];
  return out;
}

export function once(fn) {
  let result;
  return (...args) => {
    result ??= { value: fn(...args) };
    return result.value;
  };
}

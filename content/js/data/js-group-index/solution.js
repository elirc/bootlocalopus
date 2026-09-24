// Object.create(null): no prototype, so keys like "__proto__", "constructor"
// and "toString" are ordinary keys instead of inherited members.
const toGetter = (key) => (typeof key === 'function' ? key : (item) => item[key]);

export function groupBy(items, key) {
  const get = toGetter(key);
  const out = Object.create(null);
  for (const item of items) {
    const k = String(get(item));
    (out[k] ??= []).push(item);
  }
  return out;
}

export function keyBy(items, key) {
  const get = toGetter(key);
  const out = Object.create(null);
  for (const item of items) out[String(get(item))] = item;
  return out;
}

export function countBy(items, key) {
  const get = toGetter(key);
  const out = Object.create(null);
  for (const item of items) {
    const k = String(get(item));
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

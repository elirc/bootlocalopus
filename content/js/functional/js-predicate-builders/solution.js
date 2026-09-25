export const prop = (path) => {
  const keys = String(path).split('.');
  return (item) => keys.reduce((value, key) => (value == null ? undefined : value[key]), item);
};

// Curried by argument count: propEq('status')('open') and propEq('status', 'open').
export function propEq(path, ...rest) {
  const get = prop(path);
  const is = (value) => (item) => get(item) === value;
  return rest.length === 0 ? is : is(rest[0]);
}

const isNumber = (v) => typeof v === 'number' && !Number.isNaN(v);
export const gte = (n) => (value) => isNumber(value) && value >= n;
export const lte = (n) => (value) => isNumber(value) && value <= n;

export function includesText(query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (needle === '') return () => true;
  return (value) => typeof value === 'string' && value.toLowerCase().includes(needle);
}

export const allOf = (...preds) => (item) => preds.every((p) => p(item));
export const anyOf = (...preds) => (item) => preds.some((p) => p(item));
export const not = (pred) => (item) => !pred(item);

export function where(spec) {
  const checks = Object.entries(spec).map(([path, expected]) => {
    const get = prop(path);
    return typeof expected === 'function'
      ? (item) => Boolean(expected(get(item)))
      : (item) => get(item) === expected;
  });
  return allOf(...checks);
}

const present = (v) => v !== undefined && v !== '';
// Number('') is 0 and Number(' ') is 0, so reject blanks before converting.
const toBound = (v) => {
  if (!present(v) || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function fromQuery(query = {}) {
  const conditions = [];

  if (present(query.status)) {
    const allowed = query.status.split(',').map((s) => s.trim()).filter(Boolean);
    conditions.push(anyOf(...allowed.map(propEq('status'))));
  }
  if (present(query.q)) {
    const text = includesText(query.q);
    conditions.push(anyOf(where({ name: text }), where({ email: text })));
  }
  const min = toBound(query.minTotal);
  if (min !== null) conditions.push(where({ total: gte(min) }));
  const max = toBound(query.maxTotal);
  if (max !== null) conditions.push(where({ total: lte(max) }));
  if (present(query.owner)) conditions.push(propEq('owner.name', query.owner));

  return allOf(...conditions);
}

export function shallowEqual(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => Object.hasOwn(b, k) && Object.is(a[k], b[k]));
}

function indexBy(records, keyOf, side) {
  const index = new Map();
  for (const record of records) {
    const k = keyOf(record);
    if (index.has(k)) {
      throw new Error(`duplicate key ${String(k)} in ${side}`);
    }
    index.set(k, record);
  }
  return index;
}

export function diffById(prev, next, { key = 'id', equals = shallowEqual } = {}) {
  const keyOf = typeof key === 'function' ? key : (record) => record[key];

  const before = indexBy(prev, keyOf, 'prev');
  const after = indexBy(next, keyOf, 'next');

  const added = [];
  const changed = [];
  for (const [k, record] of after) {
    if (!before.has(k)) {
      added.push(record);
    } else if (!equals(before.get(k), record)) {
      changed.push({ before: before.get(k), after: record });
    }
  }

  const removed = [];
  for (const [k, record] of before) {
    if (!after.has(k)) removed.push(record);
  }

  return { added, removed, changed };
}

const isMissing = (v) => v === null || v === undefined || Number.isNaN(v);

// Ascending order for two present values of the same kind.
function compareValues(a, b) {
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  return a < b ? -1 : a > b ? 1 : 0;
}

function toComparator(criterion) {
  const { key, dir = 'asc' } = typeof criterion === 'object' ? criterion : { key: criterion };
  if (dir !== 'asc' && dir !== 'desc') {
    throw new RangeError(`dir must be "asc" or "desc", got ${dir}`);
  }
  const get = typeof key === 'function' ? key : (item) => item[key];
  const sign = dir === 'desc' ? -1 : 1;

  return (x, y) => {
    const a = get(x);
    const b = get(y);
    const aMissing = isMissing(a);
    const bMissing = isMissing(b);
    // Missing values go last whatever the direction, so they skip `sign`.
    if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
    return sign * compareValues(a, b);
  };
}

export function sortBy(items, criteria) {
  const comparators = criteria.map(toComparator);
  // toSorted is stable and leaves `items` alone; returning 0 on a tie keeps input order.
  return items.toSorted((x, y) => {
    for (const compare of comparators) {
      const result = compare(x, y);
      if (result !== 0) return result;
    }
    return 0;
  });
}

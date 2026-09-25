export const lens = (get, set) => ({ get, set });

export function prop(key) {
  return lens(
    (whole) => (whole == null ? undefined : whole[key]),
    (value, whole) => {
      if (whole != null && Object.hasOwn(whole, key) && Object.is(whole[key], value)) return whole;
      const copy = whole == null
        ? (typeof key === 'number' ? [] : {})
        : Array.isArray(whole) ? whole.slice() : { ...whole };
      copy[key] = value;
      return copy;
    },
  );
}

export function find(predicate) {
  return lens(
    (arr) => (arr == null ? undefined : arr.find(predicate)),
    (value, arr) => {
      const index = arr == null ? -1 : arr.findIndex(predicate);
      if (index === -1 || Object.is(arr[index], value)) return arr;
      const copy = arr.slice();
      copy[index] = value;
      return copy;
    },
  );
}

export function compose(...lenses) {
  return lens(
    (whole) => lenses.reduce((value, l) => l.get(value), whole),
    (value, whole) => {
      // Rebuild from the inside out: set the innermost focus, then each parent.
      const setAt = (i, current) => {
        if (i === lenses.length) return value;
        const l = lenses[i];
        return l.set(setAt(i + 1, l.get(current)), current);
      };
      return setAt(0, whole);
    },
  );
}

export const path = (keys) => compose(...keys.map(prop));

// Curried by argument count: leave off `whole` to get an updater function.
export function view(l, ...rest) {
  const run = (whole) => l.get(whole);
  return rest.length ? run(rest[0]) : run;
}

export function set(l, value, ...rest) {
  const run = (whole) => l.set(value, whole);
  return rest.length ? run(rest[0]) : run;
}

export function over(l, fn, ...rest) {
  const run = (whole) => l.set(fn(l.get(whole)), whole);
  return rest.length ? run(rest[0]) : run;
}

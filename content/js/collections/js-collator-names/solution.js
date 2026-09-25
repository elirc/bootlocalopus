// Collators are costly to create, so build each (locale, options) pair once.
const cache = new Map();

function collator(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let c = cache.get(key);
  if (!c) {
    c = new Intl.Collator(locale, options);
    cache.set(key, c);
  }
  return c;
}

export function sortNames(names, locale) {
  const { compare } = collator(locale, { numeric: true });
  return names.toSorted(compare);
}

export function sameName(a, b, locale) {
  return collator(locale, { sensitivity: 'base' }).compare(a, b) === 0;
}

export function filterByPrefix(names, query, locale) {
  const { compare } = collator(locale, { sensitivity: 'base' });
  return names.filter((name) => compare(name.slice(0, query.length), query) === 0);
}

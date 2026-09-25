export function sortNames(names, locale) {
  return [...names].sort();
}

export function sameName(a, b, locale) {
  return a.toLowerCase() === b.toLowerCase();
}

export function filterByPrefix(names, query, locale) {
  return names.filter((name) => name.startsWith(query));
}

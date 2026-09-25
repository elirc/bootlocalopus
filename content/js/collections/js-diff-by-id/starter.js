export function diffById(prev, next, { key = 'id', equals } = {}) {
  // Index one side by key in a Map, then walk the other side once.
  return { added: [], removed: [], changed: [] };
}

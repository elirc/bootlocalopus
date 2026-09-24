export function setIn(obj, path, value) {
  if (path.length === 0) return value;

  const [head, ...rest] = path;
  const isIndex = typeof head === 'number';
  const base = obj ?? (isIndex ? [] : {});
  // Copy only this level; untouched siblings keep their identity.
  const copy = Array.isArray(base) ? [...base] : { ...base };
  copy[head] = setIn(base[head], rest, value);
  return copy;
}

export function updateIn(obj, path, updater) {
  const current = path.reduce((node, key) => (node == null ? undefined : node[key]), obj);
  return setIn(obj, path, updater(current));
}

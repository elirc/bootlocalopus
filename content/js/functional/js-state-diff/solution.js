const isPlainObject = (v) => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

export function diff(prev, next) {
  const ops = [];
  walk(prev, next, [], ops);
  return ops;
}

function walk(prev, next, path, ops) {
  // Shared by reference: nothing below can differ, so do not walk it.
  if (Object.is(prev, next)) return;

  if (isPlainObject(prev) && isPlainObject(next)) {
    for (const key of Object.keys(next)) {
      if (Object.hasOwn(prev, key)) walk(prev[key], next[key], [...path, key], ops);
      else ops.push({ op: 'add', path: [...path, key], value: next[key] });
    }
    for (const key of Object.keys(prev)) {
      if (!Object.hasOwn(next, key)) ops.push({ op: 'remove', path: [...path, key], oldValue: prev[key] });
    }
    return;
  }

  if (Array.isArray(prev) && Array.isArray(next)) {
    const common = Math.min(prev.length, next.length);
    for (let i = 0; i < common; i++) walk(prev[i], next[i], [...path, i], ops);
    for (let i = common; i < next.length; i++) ops.push({ op: 'add', path: [...path, i], value: next[i] });
    // Highest index first, so each removal leaves the earlier indexes valid.
    for (let i = prev.length - 1; i >= common; i--) ops.push({ op: 'remove', path: [...path, i], oldValue: prev[i] });
    return;
  }

  if (prev instanceof Date && next instanceof Date && prev.getTime() === next.getTime()) return;

  ops.push({ op: 'replace', path, value: next, oldValue: prev });
}

// Copy one container and apply `edit` to the copy.
function withCopy(container, edit) {
  const copy = Array.isArray(container) ? container.slice() : { ...container };
  edit(copy);
  return copy;
}

function applyOne(node, [key, ...rest], op) {
  if (rest.length > 0) {
    // Not the last key yet: copy this level and descend.
    return withCopy(node, (copy) => {
      copy[key] = applyOne(node[key], rest, op);
    });
  }
  return withCopy(node, (copy) => {
    const isArray = Array.isArray(copy);
    if (op.op === 'add' && isArray) copy.splice(key, 0, op.value);
    else if (op.op === 'remove' && isArray) copy.splice(key, 1);
    else if (op.op === 'remove') delete copy[key];
    else copy[key] = op.value; // add or replace on an object, replace on an array
  });
}

export function applyPatch(state, ops) {
  return ops.reduce((current, op) => (op.path.length === 0 ? op.value : applyOne(current, op.path, op)), state);
}

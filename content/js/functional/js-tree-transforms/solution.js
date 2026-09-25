export function filterTree(nodes, predicate) {
  let changed = false;
  const kept = [];
  for (const node of nodes) {
    const children = Array.isArray(node.children) ? filterTree(node.children, predicate) : undefined;
    const hasKeptChild = children !== undefined && children.length > 0;
    if (!predicate(node) && !hasKeptChild) {
      changed = true; // this node is dropped
      continue;
    }
    if (children === undefined || children === node.children) {
      kept.push(node); // whole subtree unchanged: share it
    } else {
      kept.push({ ...node, children });
      changed = true;
    }
  }
  return changed ? kept : nodes;
}

export function findPath(nodes, predicate) {
  for (const node of nodes) {
    if (predicate(node)) return [node];
    if (Array.isArray(node.children)) {
      const below = findPath(node.children, predicate);
      if (below.length > 0) return [node, ...below];
    }
  }
  return [];
}

export function flatten(nodes, { isExpanded = () => true } = {}) {
  const rows = [];
  const walk = (forest, depth, parentId) => {
    for (const node of forest) {
      rows.push({ node, depth, parentId });
      if (Array.isArray(node.children) && isExpanded(node)) walk(node.children, depth + 1, node.id);
    }
  };
  walk(nodes, 0, null);
  return rows;
}

export function updateNode(nodes, id, fn) {
  return update(nodes, id, fn).forest;
}

// Returns { forest, found }. `found` stops the search at the first match,
// even when fn left that node unchanged.
function update(forest, id, fn) {
  for (let i = 0; i < forest.length; i++) {
    const node = forest[i];
    let replacement;
    if (node.id === id) {
      replacement = fn(node);
    } else if (Array.isArray(node.children)) {
      const inner = update(node.children, id, fn);
      if (!inner.found) continue;
      replacement = inner.forest === node.children ? node : { ...node, children: inner.forest };
    } else {
      continue;
    }
    if (replacement === node) return { forest, found: true };
    // Copy this level only; siblings keep their identity.
    const copy = forest.slice();
    copy[i] = replacement;
    return { forest: copy, found: true };
  }
  return { forest, found: false };
}

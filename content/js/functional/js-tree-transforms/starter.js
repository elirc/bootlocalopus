export function filterTree(nodes, predicate) {
  // TODO: keep matches and their ancestors; share unchanged subtrees
  throw new Error('filterTree: not implemented');
}

export function findPath(nodes, predicate) {
  // TODO: root-to-match breadcrumb, [] if none
  throw new Error('findPath: not implemented');
}

export function flatten(nodes, { isExpanded = () => true } = {}) {
  // TODO: pre-order rows { node, depth, parentId }
  throw new Error('flatten: not implemented');
}

export function updateNode(nodes, id, fn) {
  // TODO: copy only the path to the node
  throw new Error('updateNode: not implemented');
}

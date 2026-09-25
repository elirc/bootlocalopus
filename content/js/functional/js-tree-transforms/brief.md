Navigation menus, category pickers, file browsers, org charts and comment
threads are all trees, and the same four operations come up every time:
search that keeps a match's ancestors visible, breadcrumbs, rendering a
collapsible tree as a flat (virtualisable) list, and updating one node deep
inside. Each is a short recursive function, and each has a way to be wrong:

- a search that returns matches **without their parents**, so "Billing"
  shows up with no "Settings" above it;
- an update that rebuilds **every** node with `{ ...node, children: … }`, so
  every memoised row re-renders on every keystroke even though one node
  changed;
- a flatten that forgets collapsed nodes' children are hidden.

## Task

A tree here is a **forest**: an array of nodes `{ id, label, children? }`,
where `children` (when present) is another forest. Nothing may be mutated.
Export:

### `filterTree(nodes, predicate)`

Returns the forest of nodes that match `predicate(node)` **or have a
descendant that matches**, in the original order. A kept node that has a
`children` array gets the filtered children (possibly `[]`). A kept node
with no `children` property stays without one.

Structural sharing: a node whose whole subtree is kept unchanged is returned
as **the same object**, and if nothing at all was removed, the result is the
**same array** as `nodes`.

### `findPath(nodes, predicate)`

The array of nodes from a root down to the **first** match in pre-order
(parent before children, siblings in order), inclusive. `[]` if nothing
matches. This is a breadcrumb trail.

### `flatten(nodes, { isExpanded = () => true } = {})`

Pre-order list of `{ node, depth, parentId }` rows (roots have depth `0` and
`parentId: null`). The children of a node are included only when
`isExpanded(node)` is truthy. `node` is the original node object.

### `updateNode(nodes, id, fn)`

Replaces the first node (pre-order) with `node.id === id` by `fn(node)`.
Only the nodes on the path to it are copied; every other node and array
keeps its identity. If no node has that id, or `fn` returns the node it was
given, return `nodes` itself.

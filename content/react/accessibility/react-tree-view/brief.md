Boss: a file browser, a settings sidebar, a comment thread you can fold.
Built from nested `<ul>`s and click handlers, a tree is a wall of links to a
keyboard user and a flat, levelless list to a screen reader. The ARIA
**tree** pattern gives it structure (levels, positions, expanded or not) and
keyboard behaviour that screen reader users already know from their file
manager.

## Task

Export `TreeView({ label, nodes, onSelect })`. `nodes` is
`[{ id, label, children? }]`, nested to any depth; a node with a non-empty
`children` array is a **parent**, anything else is a **leaf**.
`onSelect(id)` is called when a node is selected.

**Markup**

- `<ul role="tree" aria-label={label}>`.
- Each node is an `<li role="treeitem">` with:
  - `aria-label={node.label}` (the item contains its children, so without it
    the name would be computed from every descendant's text);
  - `aria-level` (top level is `1`), `aria-setsize` (how many siblings,
    itself included) and `aria-posinset` (1-based position among them);
  - `aria-selected="true"` on the selected node and `"false"` on every other;
  - on parents only, `aria-expanded="true|false"`;
  - a roving `tabIndex`: exactly one treeitem has `0`, all others `-1`.
- An expanded parent renders its children inside `<ul role="group">` in its
  `<li>`. A collapsed parent renders **no** group.

Everything starts collapsed and unselected, with the first node as the tab
stop. A node is **visible** when all its ancestors are expanded.

**Keyboard** (on the focused treeitem; `preventDefault()` every key you handle)

| Key | Does |
| --- | --- |
| `ArrowDown` / `ArrowUp` | focus the next / previous **visible** node (no wrapping) |
| `ArrowRight` | collapsed parent: expand it (focus stays); expanded parent: focus its first child; leaf: nothing |
| `ArrowLeft` | expanded parent: collapse it (focus stays); otherwise focus its parent; nothing at the top level |
| `Home` / `End` | focus the first / last visible node |
| `Enter` or `Space` | select the focused node |
| a printable character | focus the next visible node, after the current one and wrapping, whose label starts with it (case-insensitive) |

Focus moves for real (`document.activeElement`), and the tab stop moves
with it.

**Selecting and clicking**

- Selecting marks the node `aria-selected="true"` (one at a time; selecting
  it again keeps it selected) and calls `onSelect(id)`.
- Clicking a node focuses it, selects it and, if it is a parent, toggles it.
  Items are nested, so a click on a child must not also count as a click on
  its ancestors.

**When `nodes` changes**, if the node holding the tab stop no longer exists,
the first node becomes the tab stop.

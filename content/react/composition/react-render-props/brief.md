A render prop hands the consumer the state and lets them decide the markup.
It is the right tool when the wrapper owns behaviour but should not own
appearance — lists with empty states, virtualisation, drag handles.

## Task

Export:

- `List({ items, children, empty })` — calls `children(item, index)` for each
  item and wraps the results in a `<ul>` with `<li>` per item. When `items` is
  empty, render `empty` if given, otherwise `<p>Nothing here</p>`. Do not
  render a `<ul>` at all when empty.
- `Toggle({ children, initial })` — owns a boolean and calls
  `children({ on, toggle })`.
- `Resource({ load, children })` — loads on mount and calls
  `children({ status, data, error })` where status is
  `'loading' | 'success' | 'error'`. It loads **once**: consumers will pass
  `load` as an inline arrow, which is a new function on every parent render,
  and that must not trigger a reload.
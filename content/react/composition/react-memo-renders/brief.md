`React.memo` compares props shallowly. It does nothing if you hand it a new
function or a new object literal every render — which is the default.

## Task

The starter re-renders `ExpensiveRow` every time the parent's unrelated
`counter` changes. Fix it so that:

- clicking **Bump** (unrelated state) does **not** re-render any row
- clicking a row's **Select** button re-renders only what must change
- editing the filter re-renders rows only when the visible set changes
- clicking **Bump** does not re-render `Summary` either. `Summary` is already
  wrapped in `memo`, but it receives the filtered array — and a new array on
  every render is a new prop every render

Keep the `renderLog` array export and push to it exactly as the starter does —
that is how this is graded.

Rules: do not change `ExpensiveRow`'s or `Summary`'s props, or the rendered output. You may
add `memo`, `useCallback` and `useMemo`.
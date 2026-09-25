Sometimes a parent genuinely needs to *tell* a child to do something: focus
the search box after a keyboard shortcut, clear it when filters reset. Props
cannot express "do this now" well, so React lets a component expose an
imperative handle through a `ref`.

Two ways to get it wrong:

- **Forgetting `forwardRef`.** In React 18 a function component does not
  receive `ref` as a prop; React drops it and warns, and the parent's
  `ref.current` stays `null`.
- **Forwarding the raw DOM node.** It works, and now every parent can
  `ref.current.value = 'x'` behind the component's back, bypassing its state
  and its `onValueChange`. The component has lost control of its own
  invariants. Expose a small, deliberate API instead with
  `useImperativeHandle`.

## Task

Export `SearchInput`, created with `forwardRef`, taking
`{ label, onValueChange }`:

- renders `<input type="search" aria-label={label}>`, **controlled by its own
  state**, starting empty
- typing calls `onValueChange(newValue)`
- the ref receives a handle object with **exactly two methods**, and nothing
  else:
  - `focus()` — focuses the input
  - `clear()` — empties the input, calls `onValueChange('')`, and focuses
    the input
- the handle is **not** the DOM node
- `clear()` must call the **latest** `onValueChange`, even if the parent
  passed a new one after the ref was attached
- function refs (`ref={(handle) => …}`) must work as well as `useRef` objects

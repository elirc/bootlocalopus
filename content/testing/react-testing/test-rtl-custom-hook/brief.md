The drawing app's undo had a test: set a value, undo, check the old value
is back. It passed. Users still lost work: after undoing twice and drawing
a new stroke, **Redo** brought back strokes from the abandoned branch. And a
toolbar button that called `set((n) => n + 1)` twice in one click only
moved by one. A hook is an API. Its contract covers **sequences** of
calls, **updater functions**, **limits**, and whether its functions keep
their **identity**, because callers put them in dependency arrays.

`renderHook` renders a hook inside a throwaway component and gives you
`result.current`, which always holds the latest return value. Call the
hook's functions inside `act(() => { … })` so React applies the update
before you read `result.current` again.

```jsx
const { result, rerender } = renderHook(() => solution.useUndoable(0));
act(() => { result.current.set(1); });
expect(result.current.value).toBe(1);
```

## The hook under test

`useUndoable(initial, { limit = 50 } = {})` returns
`{ value, set, undo, redo, reset, canUndo, canRedo }`.

- `set(next)` takes a value **or an updater** `(prev) => next`. It records
  the current value as an undo step and **clears the redo stack**. Setting
  a value that is `Object.is`-equal to the current one does **nothing**
  (no history entry).
- Several updaters in one `act` apply in order, each to the result of the
  previous one: `set(n => n + 1)` twice adds 2.
- `undo()` goes back one step and makes it redoable. `redo()` goes forward
  one step. Either one does **nothing** when there is nothing to undo or
  redo.
- At most `limit` undo steps are kept. When there are too many, the
  **oldest** are dropped.
- `reset(value)` sets the value and **clears all history**.
- `canUndo` and `canRedo` say whether `undo` and `redo` would do anything.
- `set`, `undo`, `redo` and `reset` keep the **same identity** across
  renders.

## Your task

Write a test file that uses `describe` / `it` / `expect` with `renderHook`
and `act` (globals) against the global `solution` (also available as
`subject`).

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but stores
  one history array and a cursor, and returns a new object on every render.
  Compare values and flags, never `result.current` itself.
- Eight planted bugs must each make at least one of your tests fail.

## The trap

`const { set } = result.current` taken once, then called over several
`act`s, still works if the functions are stable, and that is what you want
to verify. But **values** must always be read fresh from `result.current`
after each `act`. A variable you destructured earlier is a snapshot from
an old render.

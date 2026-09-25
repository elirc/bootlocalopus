Undo is the feature product asks for after launch, and it is only easy if
state changes were already immutable and centralised. The classic shape is
three pieces: `past`, `present`, `future`. Each change pushes `present` onto
`past`; undo moves `present` to `future` and pops `past`; any **new** change
clears `future` (you cannot redo into a timeline that no longer exists).

The bugs show up at the edges: undo when there is nothing to undo, a no-op
change that fills the history with identical entries so Undo seems to do
nothing, history that grows forever, and callbacks that change identity every
render so every child re-renders.

## Task

Export `useUndoable(initialPresent, { limit = 100 } = {})` returning
`{ present, set, undo, redo, reset, canUndo, canRedo }`:

- `set(next)` or `set((present) => next)` makes `next` the new present, pushes
  the old present onto the past, and **clears the future**. If `next` is
  `Object.is`-equal to the current present, nothing happens (no history
  entry).
- two `set` calls in one event handler both apply, and create two entries.
- `undo()` / `redo()` step back and forward; with nothing to undo or redo they
  do nothing.
- the past keeps at most `limit` entries (read when the hook mounts); when it overflows, the **oldest**
  are dropped.
- `reset(value)` makes `value` the present and clears both past and future.
- `canUndo` / `canRedo` are booleans.
- `set`, `undo`, `redo` and `reset` are the **same functions** on every
  render.

Then export `Counter()` built on it: a `<output>` showing the count (starting
at `0`), and buttons `+1`, `Undo` and `Redo`, where `Undo` and `Redo` are
`disabled` when there is nothing to undo or redo.

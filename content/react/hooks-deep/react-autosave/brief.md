Autosave looks like three lines: `useEffect(() => { save(value); }, [value])`.
In production it does all of this wrong:

- it sends a request **per keystroke**;
- two requests overlap, the older one lands **last**, and the server keeps the
  stale text;
- `save` is an inline arrow from the parent, so putting it in the dependency
  array re-saves on every parent render, and leaving it out calls a stale one;
- the user closes the editor within the debounce window and **loses their
  last edit**;
- the status line says "Saved" while newer text is still unsaved.

This boss uses everything in the chapter: refs for the latest values, effects
that clean up, timers you do not restart by accident, and state that is
derived rather than duplicated.

## Task

Export `useAutosave(value, save, { delay = 1000, schedule })` returning
`{ status, error, flush }`.

`schedule(fn, ms)` starts a timer and returns a function that cancels it. The
default uses `setTimeout`/`clearTimeout`; the tests pass their own and fire
timers by hand, so **use `schedule` for the debounce**, not `setTimeout`.

**Saving**

- The value on the first render counts as already saved: no save, no timer.
- Each change of `value` cancels the pending timer and schedules a new one
  with `delay` (debounce). When it fires, call `save(latestValue)`.
- If the latest value is `Object.is`-equal to the **last successfully saved**
  value, do not call `save` (the user edited and changed it back).
- **At most one save in flight.** If the timer fires (or `flush()` is called)
  while a save is running, wait; when that save settles (success or failure),
  immediately save the **latest** value if it still differs from the last
  saved value. Intermediate values are skipped.
- A new `save` function (or `schedule`) identity must not restart the timer;
  whichever `save` is latest is the one called.
- `flush()` cancels the timer and saves right away (same rules: nothing if
  there is nothing unsaved, wait if a save is in flight). A value whose save
  failed counts as unsaved. `flush` is stable across renders.
- On unmount, cancel the timer. If the latest value is unsaved and is not the
  value currently being saved, call the latest `save(latestValue)` once,
  synchronously (there is no one left to show the result to).
- Mounting under `<React.StrictMode>` must not save.

**Status**, one of:

| status | when |
| --- | --- |
| `'idle'` | nothing has been saved since mount, and there is nothing unsaved |
| `'pending'` | there are unsaved changes and no save is in flight |
| `'saving'` | a save is in flight (a change during it does not change this) |
| `'saved'` | the last save succeeded and the value has not changed since |
| `'error'` | the last save failed; `error` is exactly what it rejected with |

`error` is `null` except in the `'error'` state; starting a new save clears
it. When a save succeeds but the value has moved on, the status is `'pending'`,
not `'saved'`. When a timer fires on a value that was changed back to the last
saved value, the status returns to `'saved'` (or `'idle'` if nothing was ever
saved).

**`NoteEditor({ initialText, save, schedule })`** uses the hook with a delay of
1000 and renders:

- `<textarea aria-label="Note">` holding the text, starting at `initialText`
- `<p role="status">` with `''` (idle), `Unsaved changes`, `Saving…` (with the
  single `…` character), `Saved`, or `Save failed: <error.message>`
- a `Save now` button that calls `flush`

Fetching in an effect has two classic bugs:

1. **The race.** Props change, a second request starts, the *first* one resolves
   last and overwrites fresh data with stale data.
2. **The leak.** The component unmounts and the resolved promise still calls
   `setState`.

Both are fixed by the effect's cleanup function.

## Task

Export `UserProfile({ userId, load })` where `load(id, signal)` returns a
promise for `{ name }`.

- while loading, render `Loading…`
- on success, render an `<h2>` with the name
- on failure, render `Something went wrong` plus a `Retry` button that
  refetches
- when `userId` changes, refetch and ignore any in-flight response for the old
  id — even if it resolves later
- pass an `AbortSignal` to `load` and abort it on cleanup
- never call `setState` after unmount
- callers will pass `load` as an inline arrow, which is a new function on
  every parent render. That must **not** refetch: refetch only when `userId`
  changes or on Retry. (Put `load` in the dependency array and every parent
  render refetches — and since the effect sets state, that can loop.)
Every screen of a dashboard polls "is the user still logged in?", "how many
items in the basket?", "which filter is active?" — or every setter calls every
widget's `refresh()` by hand, and the one somebody forgot shows stale data.
The **observer** pattern inverts that: widgets subscribe to a store, the store
tells them when something changed. Redux, Zustand and `useSyncExternalStore`
are all this, and so is the bug where every widget re-renders on every
keystroke because it subscribed to *everything*.

## Task

Export `createStore(initialState)` returning:

- `getState()` — the current state object.
- `setState(update)` — `update` is either a function `(state) => nextState`
  or a partial object shallow-merged into the state (`{ ...state, ...partial }`).
  **No change, no notification:** if a function returns the same object, or
  every key of a partial is already `Object.is`-equal to the current value,
  the state keeps its identity (`getState()` returns the very same object) and
  nobody is notified.
- `subscribe(listener)` — calls `listener(state, prevState)` after every
  change. Returns an `unsubscribe()` function; calling it twice is harmless.
- `select(selector, listener, equals = Object.is)` — calls
  `listener(selected, prevSelected)` only when the selected slice changed
  according to `equals(prev, next)`. The first "previous" slice is computed at
  subscribe time. Returns an `unsubscribe()`.
- `batch(fn)` — run `fn()`; every `setState` inside it updates the state
  immediately, but listeners are notified **once**, after `fn` returns, with
  `prevState` being the state from *before* the batch. Nested batches notify
  once, when the outermost ends. If nothing changed, nobody is notified. If
  `fn` throws, notify for what did change, then rethrow. Return `fn`'s result.

Notification order is subscription order (`subscribe` and `select` share one
list). During a notification round:

- a listener that is unsubscribed **before its turn** is not called;
- a listener subscribed during the round is first called on the next change.

## The traps

- A selector like `(s) => s.todos.filter((t) => t.done)` returns a new array
  every time, so `Object.is` says "changed" on every update. That is what the
  `equals` parameter is for; the tests pass a shallow array comparison.
- Iterating a live `Set` while listeners unsubscribe or subscribe inside the
  loop gives you the wrong answer to both rules above. Iterate a snapshot, but
  check the listener is still subscribed before calling it.

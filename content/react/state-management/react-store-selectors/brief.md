Context re-renders **every** consumer when its value changes. For app-wide
state that changes often (a shopping cart, a live dashboard), that is the
whole app on every update. Libraries like Zustand and Redux avoid it with the
same trick, and it is small enough to write yourself: keep the state in a
plain object **outside React**, and let each component subscribe to **the
slice it selects**. A component re-renders only when its slice changes.

React's hook for this is `useSyncExternalStore(subscribe, getSnapshot)`. The
trap is the selector. `useSyncExternalStore` compares snapshots with
`Object.is`, so a selector that builds a new array or object
(`(s) => s.todos.filter((t) => !t.done)`) returns a "new" snapshot on every
call. React sees the store as always changing, re-renders forever, and bails
out with "The result of getSnapshot should be cached". The fix is to
remember the last selection and hand back the **same** object while an
equality function says nothing changed.

## Task

1. `createStore(initialState)` returns `{ getState, setState, subscribe }`:
   - `setState(partial)` shallow-merges `partial` into the state:
     `{ ...state, ...partial }`. `setState(fn)` merges `fn(state)`.
   - if the merge changes nothing (every key in `partial` is `Object.is`-equal
     to the current value), the state object stays the same and **listeners
     are not called**.
   - `subscribe(listener)` returns an unsubscribe function. Listeners are
     called with no arguments after each change. A listener that
     unsubscribes (itself or another) while listeners are being called must
     not break the loop.

2. `shallowEqual(a, b)`: `true` if `Object.is(a, b)`, or if both are arrays of
   the same length with `Object.is`-equal items, or both are plain objects
   with the same keys and `Object.is`-equal values. `false` otherwise.

3. `useStore(store, selector = (s) => s, isEqual = Object.is)`:
   - returns `selector(store.getState())`;
   - re-renders only when the selected value changes according to `isEqual`;
   - with `isEqual = shallowEqual`, a selector that returns a fresh array or
     object each time must work (no infinite loop) and must return the
     **previous** selection object while the contents are equal;
   - a new inline `selector` function on each render must not break anything.

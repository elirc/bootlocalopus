A reducer is a pure function `(state, action) => nextState`. The whole
Redux/`useReducer` world, and every "why did everything re-render?" bug in
it, rests on one contract: **if nothing changed, return the same object.**
Selectors, `React.memo` and `useSyncExternalStore` compare by reference, so a
root reducer that does `return { ...state }` for every action (or a slice
that returns a fresh `[]` for an action it does not handle) re-renders the
entire app on every keystroke.

The other classic: a `switch` case that forgets its `return`, so the
reducer returns `undefined` and the slice silently disappears three screens
later.

## Task

Export three functions.

### `createReducer(initialState, handlers)`

Returns `reducer(state = initialState, action)`:

- If `handlers[action.type]` exists (an **own** property; a `type` like
  `'toString'` must not find `Object.prototype.toString`), return
  `handler(state, action)`. Otherwise return `state` unchanged.
- If a handler returns `undefined`, throw a `TypeError` whose message
  contains the action type.

### `combineReducers(reducers)`

`reducers` is an object of slice reducers. Returns
`rootReducer(state = {}, action)`:

- Call **every** slice reducer with its slice (`state[key]`, `undefined` at
  first, so it produces its initial state) and the action.
- If a slice reducer returns `undefined`, throw an `Error` whose message
  contains the slice key.
- If every slice came back `===` to what it was, and `state` has no keys
  that are not in `reducers`, return **`state` itself**. Otherwise return a
  new object with exactly the reducer keys. Unchanged slices keep their
  identity either way.
- Nesting works: a slice reducer may itself come from `combineReducers`.

### `createAction(type, prepare?)`

Returns an action creator:

- `creator(payload)` returns `{ type, payload }`.
- With `prepare`, `creator(...args)` returns `{ type, ...prepare(...args) }`
  (so `prepare` can add `payload`, `meta` or `error`).
- `creator.type` is the type, `String(creator)` is the type (so it can be
  used as a key in `createReducer` handlers:
  `{ [todoAdded]: (state, action) => … }`), and `creator.match(action)` is
  `true` when `action.type` matches.

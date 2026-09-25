Redux's core is about sixty lines, and its middleware signature is the most
famous piece of currying in JavaScript:

```js
const logger = (api) => (next) => (action) => {
  console.log('dispatching', action);
  const result = next(action);
  console.log('next state', api.getState());
  return result;
};
```

Each arrow is applied at a different time: `api` once when the store is
built, `next` once when the chain is composed, `action` on every dispatch.
That is currying earning its keep, and writing the store yourself is the
fastest way to understand why a thunk can `dispatch` another thunk, why a
reducer must not dispatch, and why a reducer that throws must not leave the
store stuck.

## Task

Export `createStore` and `thunk`.

### `createStore(reducer, { preloadedState, middleware = [] } = {})`

Returns `{ getState, dispatch, subscribe }`. On creation, the state is
`reducer(preloadedState, { type: '@@store/init' })`.

**The base dispatch** (the end of the middleware chain):

- Throws a `TypeError` whose message contains `plain object` unless the
  action is a plain object (prototype `Object.prototype` or `null`), and one
  containing `type` unless `action.type` is a string.
- Runs `reducer(state, action)`. **While the reducer runs**, calling
  `dispatch`, `getState` or `subscribe` throws an `Error` whose message
  contains `reducer`.
- If the reducer throws, rethrow; the state is unchanged, nobody is
  notified, and the store keeps working afterwards.
- If the new state is `!==` the old one, store it and notify listeners (with
  no arguments). If it is the same object, notify nobody.
- Returns the action.

**Listeners.** `subscribe(listener)` returns `unsubscribe()` (calling it again
is harmless). In a notification round, listeners run in subscription order;
one that is unsubscribed before its turn is **not** called, and one
subscribed during the round is first called on the next change. A listener
may dispatch.

**Middleware.** Each is `(api) => (next) => (action) => result`, where
`api = { getState, dispatch }`.

- `middleware[0]` is the outermost: it sees each action first.
- `api.dispatch(action)` goes through the **whole chain** from the start
  (that is how a thunk's inner dispatches reach the logger), not through
  `next`.
- Calling `api.dispatch` while the store is still applying middleware (inside
  the `(api) => …` step) throws an `Error` whose message contains
  `middleware`. `api.getState()` is fine there.
- `store.dispatch(action)` returns whatever the chain returns, so a
  middleware may transform, swallow or replace an action and its result.

### `thunk`

A middleware: when the action is a **function**, call it with
`(dispatch, getState)` and return its result, without calling `next`;
otherwise pass the action on.

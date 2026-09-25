The third time you write "a loading flag, an error and the data, per
request" by hand in a reducer, you get it subtly wrong: the response for a
search the user has already replaced lands last and overwrites the newer
results, or one row's spinner turns on every row's spinner. A **higher-order
reducer** is a function that takes a reducer (or some config) and returns a
new reducer, so you write that behaviour once and compose it.

Every reducer here follows the usual contract: `(state, action) => next`,
`state` is `undefined` on the first call (produce your initial state), and an
action you do not act on returns **the same `state` object**.

## Task

Export four functions.

### `withReset(reducer, resetType)`

For an action whose `type === resetType`, return `reducer(undefined, action)`
(the wrapped reducer's initial state). Anything else goes to `reducer`.

### `filterActions(reducer, predicate)`

Actions for which `predicate(action)` is falsy are **ignored**: return `state`
unchanged. Exception: when `state` is `undefined`, always call `reducer` so the
initial state is produced.

### `requestStatus(prefix)`

A reducer for one async request, driven by three action types:

| action | meta | next state |
| --- | --- | --- |
| `` `${prefix}/pending` `` | `{ requestId }` | `{ status: 'loading', error: null, requestId }` |
| `` `${prefix}/fulfilled` `` | `{ requestId }` | `{ status: 'succeeded', error: null, requestId: null }` |
| `` `${prefix}/rejected` `` | `{ requestId }`, and `action.error.message` | `{ status: 'failed', error: message, requestId: null }` |

The initial state is `{ status: 'idle', error: null, requestId: null }`.
A `fulfilled` or `rejected` action whose `meta.requestId` is not the
**current** `requestId` is **stale** (an older request finishing after a
newer one started, or a duplicate): ignore it, returning `state` unchanged.
The last `pending` always wins. Other actions return `state`.

### `keyedBy(reducer, getKey)`

Runs one copy of `reducer` per key: the state is an object
`{ [key]: sliceState }`, initially `{}`.

- `key = getKey(action)`. If it is `undefined` or `null`, return `state`.
- Otherwise compute `reducer(state[key], action)` (`undefined` for a new
  key, so the slice starts from its initial state). If the slice comes back
  `===` to what was there, return `state`; otherwise a new object with that
  one key replaced. Other keys keep their slices.
- Only look at **own** keys: a key named `'constructor'` or `'toString'`
  must start from `undefined`, not from `Object.prototype`.

They compose: `keyedBy(requestStatus('user/fetch'), (a) => a.meta?.userId)`
is a loading state per user.

`setIn(state, ['todos', 3, 'title'], value)` works until the todo you want is
"the one with id 42", not "the one at index 3", and until three components
each hard-code the same path. A **lens** is a first-class *focus* on part of a
value: a getter and an immutable setter packaged together. Lenses compose, so
`compose(prop('todos'), find(byId(42)), prop('title'))` is a reusable "title of
todo 42" that you can read, set or update anywhere, and every update copies
only the path to the change.

## Task

A lens is an object `{ get(whole), set(value, whole) }` where `set` returns a
**new** whole and never mutates. Export:

- `lens(get, set)` — builds one.
- `prop(key)` — focuses `whole[key]` for objects (string keys) and arrays
  (number keys).
  - `get` of `null`/`undefined` is `undefined`.
  - `set` copies one level (`{ ...obj }`, or a copied array for an array) and
    assigns the key. If `whole` is `null`/`undefined`, it starts from `[]`
    when `key` is a number and `{}` otherwise.
  - **No-op rule:** if the key is already an own property and its value is
    `Object.is`-equal to the new value, `set` returns `whole` itself.
- `find(predicate)` — focuses the **first** array element matching
  `predicate`. `get` returns it (or `undefined`); `set` returns a copy of the
  array with that element replaced, or the **same array** if nothing matches
  or the element is already `Object.is`-equal to the value.
- `compose(...lenses)` — focuses through each lens left to right. Its `set`
  rebuilds only the objects along the path, so everything off the path keeps
  its identity, and a no-op `set` returns the original whole.
  `compose()` is the identity lens.
- `path(keys)` — `compose` of `prop` for each key.
- `view(l, whole)`, `set(l, value, whole)`, `over(l, fn, whole)` — read, write,
  and update (`fn` receives the current value, `undefined` if missing).
  **Curried:** called without the last argument, each returns a function of
  `whole`, so `setState(over(titleOf(42), (t) => t.trim()))` works. Count
  arguments; `set(l, undefined, whole)` sets `undefined`.

A lens built this way obeys the lens laws the tests check:
`view(l, set(l, v, s)) === v`, `set(l, view(l, s), s) === s` and
`set(l, b, set(l, a, s))` equals `set(l, b, s)`.

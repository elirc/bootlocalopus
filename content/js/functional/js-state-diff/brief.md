"Who changed the shipping address, and from what?" needs an audit log of
**changes**, not two full snapshots. A collaborative editor needs to send
the change over a websocket, not the whole document. Both need a **diff**
between two versions of the state, and a way to **apply** one.

Immutable state makes this cheap. If you only ever update with structural
sharing, an unchanged subtree is *the same object* in both versions, so the
diff can skip it with one `Object.is` check instead of walking it. A diff
that compares everything by value is correct and slow: on a 10,000-row
table where one cell changed, it walks 10,000 rows.

## Task

Export `diff(prev, next)` and `applyPatch(state, ops)`.

### `diff(prev, next)` → an array of operations

A **path** is an array of keys: strings for object keys, numbers for array
indexes. `[]` is the whole value.

- `Object.is(prev, next)`: no operations, and **do not look inside** (the
  tests hand you shared subtrees that throw if touched).
- Both **plain objects** (prototype `Object.prototype` or `null`): first, for
  each key of `next` in order: `{ op: 'add', path, value }` if `prev` does not
  have it as an own key, otherwise recurse. Then, for each key of `prev` in
  order that `next` lacks: `{ op: 'remove', path, oldValue }`.
- Both **arrays**: recurse on each index present in both; then an `add` for
  each extra index of `next` (ascending); then a `remove` for each extra index
  of `prev` (**descending**, so applying them in order works).
- Both `Date`s with the same `getTime()`: no operations.
- Anything else that differs (a primitive, an object vs an array, a `Date`
  vs a string, a class instance): `{ op: 'replace', path, value: next,
  oldValue: prev }`.

### `applyPatch(state, ops)`

Applies the operations in order and returns the new state, **without
mutating** `state`, copying only what lies on an operation's path (everything
else keeps its identity).

- `add`: on an object, set the key; on an array, **insert** at the index.
- `remove`: on an object, delete the key; on an array, remove that index.
- `replace`: set the value at the path. A `replace` with path `[]` returns
  `value`.

`applyPatch(prev, diff(prev, next))` must deep-equal `next`.

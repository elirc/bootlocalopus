Client-side stores grow indexes the moment a screen needs "all orders for this
customer" without a network round trip. The first version is a `filter` over
everything, the second adds a `Map` from `customerId` to orders — and the bugs
start:

- An `update` that changes a record's `customerId` adds it to the new bucket
  and **forgets to remove it from the old one**. The order now shows up under
  two customers.
- A unique check that runs **after** half the indexes were already updated
  leaves the store inconsistent when it throws.
- A caller mutates a record it got back (`order.status = 'paid'`) and the
  index still files it under `'pending'`.
- A batch import fails on row 800 of 1 000 and leaves 799 rows behind.

This boss is a small in-memory table with primary key, secondary indexes and
unique constraints that stays consistent through all of that.

## Task

Export `ConstraintError` (a subclass of `Error` with `name === 'ConstraintError'`
and two properties, `field` and `value`) and a class `Store`.

### `new Store({ key = 'id', indexes = [], unique = [] })`

`key` is the primary-key field. `indexes` are fields with a non-unique index;
`unique` are fields with a unique index. The primary key counts as indexed
and unique.

### Writes

- `insert(record)` → the stored record. Store a **frozen shallow copy**:
  later changes to the caller's object do not affect the store, and the
  records the store hands out cannot be mutated.
  - A primary key already present → `ConstraintError` with `field` = the key
    field and `value` = the key.
  - A value already taken in a `unique` field → `ConstraintError` with that
    `field` and `value`. `null` and `undefined` never conflict (as in SQL).
- `insertMany(records)` → array of stored records. **All or nothing**: if any
  record would violate a constraint — against the store **or against another
  record in the same batch** — throw that `ConstraintError` and insert none.
- `update(id, patch)` → the new stored record (`{ ...old, ...patch }`, frozen),
  or `null` if there is no such record. A patch that changes the primary key
  throws `ConstraintError` (field = key field). A unique conflict with **another**
  record throws. When it throws, **nothing** has changed.
- `delete(id)` → `true` if a record was removed, else `false`. Its unique
  values become free again.

### Reads

- `get(id)` → the stored record or `undefined`. `get size` → the record count.
- `findBy(field, value)` → an array of the records whose `field` equals `value`
  (SameValueZero: `1` is not `'1'`, `NaN` finds `NaN`). `field` must be the key
  or an indexed/unique field; otherwise throw an `Error` whose message
  contains `no index`.
- `query({ where = {}, orderBy = [] } = {})` → an array. `where` is an object
  of field → value, all of which must match (SameValueZero); any field is
  allowed. `orderBy` is an array of field names or `{ key, dir }` objects with
  the rules of the multi-key sort lesson: numbers numerically, strings by code
  unit, `null`/`undefined`/`NaN` last in both directions, ties stable.

**Order:** every result array lists records in the order they were first
inserted (an update keeps a record's place; delete-and-reinsert moves it to the
end), before `orderBy` is applied.

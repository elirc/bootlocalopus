An API returns `[{ id, … }, …]` and the first version of the reducer keeps it
as an array. Then every update is `items.map((i) => i.id === id ? … : i)`
(a full scan), every lookup is `items.find(…)`, the websocket delivers an
item you already have and it appears twice, and "sorted by name" is
`[...items].sort()` inside a render.

The standard fix (Redux Toolkit's `createEntityAdapter`, Apollo's and
TanStack's caches) is to **normalise**: keep `{ ids: [...], entities: { [id]:
entity } }` and do every change through small pure functions that keep both
halves in sync, keep the order, and do not change what did not change.

## Task

Export `createEntityAdapter({ selectId = (e) => e.id, sortComparer } = {})`,
returning an object of pure functions. State is
`{ ids, entities, ...anythingElse }`; other keys are always preserved.

- `getInitialState(extra = {})` → `{ ids: [], entities: {}, ...extra }`.
- `addOne(state, entity)` / `addMany(state, entities)` — add entities whose id
  is not present yet; an existing id is **left alone** (also a duplicate
  later in the same batch).
- `upsertOne(state, entity)` / `upsertMany(state, entities)` — add new ones;
  for an existing id, **shallow-merge** (`{ ...existing, ...entity }`).
- `updateOne(state, { id, changes })` / `updateMany(state, updates)` —
  shallow-merge `changes` into an existing entity; a missing id is ignored.
  If the merged entity has a different id (`selectId`), it moves to the new
  id, in the old one's position.
- `removeOne(state, id)` / `removeMany(state, ids)` — missing ids are ignored.
- `setAll(state, entities)` — replace all entities.
- `getSelectors()` → `{ selectIds, selectEntities, selectAll, selectById,
  selectTotal }`, each taking `state` (and an id for `selectById`, `undefined`
  if absent). `selectAll` returns the entities in `ids` order.

Rules every function keeps:

- **Never mutate** the state you were given.
- **No change, same object:** if an operation changes nothing (adding an id
  that exists, removing one that does not, a merge in which every value is
  already `Object.is`-equal), return `state` itself.
- **Share what did not change:** untouched entities keep their identity;
  `ids` keeps its identity when its contents and order did not change.
- **Order:** without `sortComparer`, `ids` are in insertion order, and
  updates or upserts of existing entities keep their place. With
  `sortComparer(a, b)` (over entities), `ids` are always sorted by it,
  **stably**: equal entities keep their existing order, and new ones go after
  existing equals. Changing a sorted field re-sorts.
- `ids` keep the id values `selectId` returns (a numeric id stays a number).
  An id like `'constructor'` or `'toString'` is an ordinary id.

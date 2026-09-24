`sql-n-plus-one` fixed the N+1 by writing one query that nests the results.
That works when one function owns the whole request. In a GraphQL resolver, a
React Server Component tree or a layered service, it does not: fifty
independent pieces of code each ask for "the author of this post", each with
`await users.byId(id)`, and none of them knows about the others. That is
fifty queries.

A **loader** fixes it without changing those callers. `load(id)` does not
query; it notes the id and returns a promise. Once the current turn of the
event loop has finished, the loader makes **one** call with every id it
collected — `select … where id = any($1)` — and hands each caller its row.

## Task

Write `createLoader(batchFn, { maxBatchSize = Infinity } = {})`, returning
`{ load(key) }`.

**`batchFn(keys)`** is supplied by the caller. It receives an array of keys
and returns (or resolves to) a **`Map`** from key to value. Keys may be
missing from the Map (no such row), and a value may be an **`Error`** (that
key failed, for example "not visible to you").

**`load(key)`** returns a promise, and never calls `batchFn` itself:

- **One batch per turn.** Every `load` made in the same turn of the event
  loop — synchronously, *or* in code that resumed after `await`ing an
  already-settled promise — lands in the same batch. A `load` made after the
  batch was dispatched (for example while it is in flight) goes into the next
  one. There is **no cache** between batches: loading a key again after its
  batch settled calls `batchFn` again.
- **Dedupe.** `batchFn` gets each key once, in the order it was first
  requested. Keys compare as `Map` keys do: `1` and `'1'` are different.
  Every `load` of the same key resolves to the same value.
- **Per key.** A key missing from the Map (or mapped to `undefined`)
  resolves to `null`. A key mapped to an `Error` **rejects with that error**;
  the other loads in the batch are unaffected.
- **Whole batch.** If `batchFn` throws (synchronously or by rejecting), or
  resolves to anything that is not a `Map`, every load in that batch rejects —
  with the thrown error, or with a `TypeError` for the wrong return type.
  `load` itself never throws.
- **`maxBatchSize`.** A batch with more keys than this is split into
  consecutive chunks of at most `maxBatchSize`, in key order, each its own
  `batchFn` call.

## How it is graded

`batchFn` is a recording fake, so the tests assert structure, not time: 50
loads → exactly one call with the 50 keys; loads after 1, 3 and 10 `await`s
of settled promises share that batch; a load during an in-flight batch makes a
second call with only its key; 50 keys with `maxBatchSize: 20` → calls of 20,
20, 10. Results are checked per key with `Promise.allSettled`, so one
rejection cannot hide another.

The trap is the scheduler. `queueMicrotask(dispatch)` fires *between* those
`await` continuations and splits the batch. Something that runs after the
whole microtask queue has drained does not.

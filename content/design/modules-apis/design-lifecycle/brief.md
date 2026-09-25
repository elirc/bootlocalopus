A service's `index.js` connects to the database, starts a queue consumer,
then calls `server.listen(3000)`, which throws `EADDRINUSE`. The process does
not exit: the database pool and the consumer are still open, holding it
alive, and the orchestrator waits two minutes before killing it. On shutdown,
the pool closes *before* the HTTP server stops, so in-flight requests fail
with "pool is closed". And the test suite calls `start()` from two
`beforeAll`s and opens two pools.

A module that owns resources needs a **lifecycle API**: start things in
dependency order, stop them in reverse, roll back a half-finished start, and
make `start`/`stop` safe to call more than once. Spring, NestJS and every
"app container" have one; this is the core of it.

## Task

Export `StartupError` (extends `Error`, `name` `'StartupError'`, with
`component` and `cause`) and `createLifecycle()` returning:

**`register(name, { start, stop } = {}, { dependsOn = [] } = {})`** — `start`
and `stop` are async functions (either may be omitted). Throws an `Error` for
a duplicate name, or if the lifecycle is not `'stopped'`.

**`state`** — `'stopped'` (initially), `'starting'`, `'started'` or
`'stopping'`.

**`start()`**

- Order: walk the components in **registration order**; before a component
  starts, its `dependsOn` entries start first (in the order listed,
  recursively). Each component starts once, and each `start` is awaited
  before the next begins.
- An unknown dependency name or a dependency cycle rejects with an `Error`
  **before anything starts**.
- If a component's `start` fails: `stop` every component that already started,
  in **reverse** start order (a failing `stop` here is ignored — keep going),
  then reject with a `StartupError` whose `component` is the one that failed
  and whose `cause` is its error. The state is back to `'stopped'`, and a
  later `start()` begins from scratch.
- Already `'started'` → resolves without doing anything. Called while a start
  is in flight → returns the **same** run (starts nothing twice).

**`stop()`**

- Stops every started component in **reverse start order**. A failing `stop`
  does not stop the others: after all have been attempted, reject with an
  `AggregateError` whose `errors` are the failures in the order they
  happened. Either way the state ends `'stopped'`.
- Already `'stopped'` → resolves without doing anything. Called while
  stopping → the same promise. Called while **starting** → waits for the
  start to settle, then stops whatever it started.

## The traps

- "Reverse order" means reverse of the order things **actually started**,
  not of registration — dependencies change the order.
- Keeping a list of started components and pushing to it only after each
  `start` succeeds gives you both the rollback list and the stop order.
- `if (state === 'started') return` is not enough for concurrency: two calls
  in the same tick both see `'stopped'`. Keep the in-flight promise and hand
  it to the second caller.

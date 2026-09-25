Processing 20 000 rows in one loop is a **long task**: for 800 ms the main
thread cannot paint or respond, and every click during that time waits. That
is exactly what Interaction to Next Paint (INP) measures.

The fix is to **yield to the main thread** regularly, so the browser can
handle input and paint in between. Two details make or break it:

- Yield on **time**, not on item count. "Every 100 items" is 5 ms on a fast
  laptop and 300 ms on a cheap phone, or when some items are slow.
- Yielding must actually give control back: `await scheduler.yield()` where
  it exists, else `await new Promise((r) => setTimeout(r, 0))`. An
  `await Promise.resolve()` yields to nothing — microtasks run before the
  browser gets a turn.

Because the result arrives later, the work must also be cancellable: the user
may have navigated away.

## Task

Export `processInChunks(items, fn, options)` returning a promise of the
array of `fn(item, index)` results, in order. Options:

- `budgetMs` (default `50`), `now` (a clock returning ms), `yieldToMain`
  (returns a promise) — injected so the grader can control time;
- `signal` (optional `AbortSignal`).

The algorithm, exactly:

1. If `signal` is already aborted, reject with `signal.reason` without calling
   `fn`.
2. Record the slice start: `sliceStart = now()`.
3. For each item: **if it is not the first item** and
   `now() - sliceStart >= budgetMs`, `await yieldToMain()`, then — if `signal`
   is now aborted — reject with `signal.reason`, then set `sliceStart = now()`.
   Then call `fn(item, index)` and keep its result.

So every slice processes at least one item (progress is guaranteed even when a
single item is slower than the budget), and the check happens **before** an
item, so no yield is wasted after the last one. If `fn` throws, reject with
that error and process nothing more. An empty `items` resolves to `[]`
without yielding.

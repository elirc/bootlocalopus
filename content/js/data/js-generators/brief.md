An async generator lets a caller `for await` over an unbounded source and
stop whenever it likes — the producer only does work that is actually consumed.
This is how paginated API clients should be written.

## Task

Export:

- `async function* paginate(fetchPage)` — `fetchPage(cursor)` resolves to
  `{ items, nextCursor }`. Yield **each item** one at a time, starting from
  cursor `undefined`, and stop when `nextCursor` is null/undefined. A page is
  only fetched when its first item is actually pulled.
- `async function take(n, iterable)` — collect at most `n` items into an array,
  then stop consuming.
- `function* chunk(iterable, size)` — a **sync** generator yielding arrays of
  up to `size`.
```ts
async function allOrders(): Promise<Order[]> {
  const out: Order[] = [];
  let cursor = null;
  do { const page = await api.orders(cursor); out.push(...page.items); cursor = page.next; } while (cursor);
  return out;
}
const firstThree = (await allOrders()).slice(0, 3); // downloaded 40,000 orders to show three
```

Cursor-paginated APIs (Stripe, GitHub, Slack, most internal services) get
wrapped in a helper that loads **everything** into an array, because that is
easy to type. Then someone needs "the first few", or "process them in batches
of 100", and the helper downloads the whole collection first — or never
finishes, when the API has a bug that hands back a cursor it has already
returned.

An **async generator** fixes both: it yields items one at a time and fetches
the next page only when the consumer asks for an item past the end of the
current one. Stopping early (`break` in a `for await`, or `return()` on the
iterator) stops the fetching. The types come out naturally:
`AsyncGenerator<T, void, undefined>` for the producer, `AsyncIterable<T>` for
anything a consumer accepts.

## Task

`Page<T>` and `FetchPage<T>` are in the starter. The first page is requested
with cursor `null`; a page whose `nextCursor` is `null` is the last one.

**`paginate(fetchPage)`** — an async generator of every item of every page,
in order.

- Nothing is fetched until the first item is requested, and the next page is
  fetched only when the consumer asks for an item after the current page's
  last one.
- An empty page that still has a cursor is not the end: keep going.
- If the API returns a `nextCursor` it has **already returned before** (not
  just the previous one), throw an `Error` with the message
  `cursor repeated: <cursor>` (for example `cursor repeated: a`) after
  yielding the current page's items — without fetching it again.
- A rejected `fetchPage` rejects the consumer's `next()`.

**`take(source, n)`** — resolves to the first `n` items of any
`AsyncIterable`. It pulls exactly as many items as it returns, then closes the
source (so the source's `finally` blocks run and no further pages load). For
`n <= 0` it resolves to `[]` without pulling anything.

**`chunk(source, size)`** — an async generator of arrays of `size` items;
the last array may be shorter, and there is never an empty one. Each chunk is
yielded as soon as it is full. A `size` that is not a positive integer throws
a `RangeError` (from the first `next()`, since generator bodies start lazily).

The trap in `take` is the condition you stop on: check after pushing, so the
loop does not pull the `n + 1`-th item just to find out it is done.

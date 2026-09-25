WebSocket messages, file-watcher events and job-progress callbacks all
**push** values at you. `for await` wants to **pull** them. The adapter
between the two — a channel — is ten lines if you get it wrong:

- values pushed before anyone is reading are **lost**, because the code only
  resolves a waiting reader;
- two `next()` calls made before a value arrives share one resolver slot and
  one of them hangs forever;
- `close()` ends the loop while buffered values are still unread;
- a consumer that `break`s out of the loop never tells the producer, so the
  listener keeps firing into a channel nobody reads — a slow memory leak.

## Task

Export a class `Channel` implementing the async iterator protocol:

```js
const ch = new Channel({ highWaterMark: 100, onCancel: () => socket.off('message', ch.push) });
socket.on('message', (m) => ch.push(m));
for await (const message of ch) { … }
```

- `new Channel({ highWaterMark = Infinity, onCancel } = {})`.
- `push(value)` — hand the value to the oldest waiting `next()` if there is
  one, otherwise buffer it. Returns `true` while the buffer holds fewer than
  `highWaterMark` values after the push, `false` otherwise (the value is still
  kept — `false` means "slow down", like `stream.write`).
  After `close()` or `fail()`, `push` throws an `Error`. After the consumer
  cancelled (see `return`), `push` silently drops the value and returns `false`.
- `close()` — the producer is done. Buffered values are still delivered; then
  every `next()` resolves `{ value: undefined, done: true }`.
- `fail(error)` — like `close()`, but once the buffer is drained the next
  `next()` **rejects** with `error`; every call after that is `done`.
- `next()` — a promise of `{ value, done: false }` for the oldest buffered
  value, or waits for the next push. Concurrent `next()` calls are served in
  order.
- `return()` — the consumer stopped early (`for await` calls this on `break`
  or `throw`). Clear the buffer, resolve any waiting `next()` with done, and
  resolve `{ value: undefined, done: true }`. Call `onCancel()` exactly
  **once** — and only if the producer had not already called `close()` or
  `fail()` (then there is nobody left to unsubscribe). Every later `next()`
  is done.
- `[Symbol.asyncIterator]()` returns the channel itself.
- `get size` — the number of buffered values.

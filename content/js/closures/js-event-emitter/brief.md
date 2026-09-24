Time to put the chapter together. You are building the pub/sub primitive
that Node's `EventEmitter`, the DOM, and every state library reimplement.

## Task

Export a class `Emitter` with:

- `on(event, handler)` — subscribe; returns an `unsubscribe()` function
- `once(event, handler)` — auto-unsubscribes after the first delivery
- `off(event, handler)` — remove a specific handler
- `emit(event, ...args)` — call handlers **in subscription order**; returns
  the number of handlers called
- `listenerCount(event)`

Rules that matter in real code:

1. A handler that throws must not stop the other handlers. Collect the errors
   and, if any occurred, throw an `AggregateError` **after** all handlers ran.
2. Unsubscribing during an `emit` must not skip or double-call anyone — iterate
   over a snapshot. The snapshot also means a handler subscribed *during* an
   emit is first called on the next emit, not this one.
3. No memory leaks: an event with zero listeners must not keep an empty entry.
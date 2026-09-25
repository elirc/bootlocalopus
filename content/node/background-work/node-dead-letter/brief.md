A message on the `invoices` queue has a body the handler cannot process — a
customer id that was deleted, or JSON truncated by a buggy producer. The
consumer throws, the broker redelivers it, the consumer throws again. Forever.
It burns a worker, fills the logs with the same stack trace every second, and
on a FIFO queue it blocks everything behind it. That is a **poison message**.

The fix is a **dead-letter queue** (DLQ): after a bounded number of deliveries
— or immediately, if the error can never succeed — the message is moved
aside, with the reason, where a human can inspect it and replay it after the
bug is fixed.

Two details decide whether the DLQ actually protects you:

- **Count deliveries where they survive a restart.** A counter in the
  consumer's memory resets every deploy, so a poison message gets five fresh
  attempts per restart. Brokers track it for you: use the message's
  `receiveCount`.
- **Write to the DLQ before you acknowledge.** Ack first and the DLQ write
  fails, and the message is simply gone — the one message you most needed to
  look at.

## Task

Export `createConsumer(options)` returning `{ pollOnce }`:

```js
createConsumer({
  queue,        // { receive(max), ack(id), release(id, delayMs) } — all return promises
  dlq,          // { send(entry) } — returns a promise
  handler,      // async (body, { id, receiveCount }) => void
  maxReceives = 5,
  isPermanent = () => false,                       // (error) => boolean
  backoff = (receiveCount) => 1000 * 2 ** (receiveCount - 1),
  batchSize = 10,
})
```

`queue.receive(max)` resolves to up to `max` messages `{ id, body, receiveCount }`,
where `body` is a string and `receiveCount` is how many times the broker has
delivered it, **including this time** (1 on the first delivery).

**`pollOnce()`** receives one batch (`queue.receive(batchSize)`) and handles
every message in it — independently, so one message's failure or slowness
never stops another from being handled. For each message:

1. `JSON.parse(body)` fails → dead-letter it with reason `'unparseable'`.
   The handler is not called.
2. Call `handler(parsed, { id, receiveCount })` (a synchronous throw counts
   as a failure). It resolves → `queue.ack(id)`.
3. It fails, and `isPermanent(error)` → dead-letter with reason `'permanent'`.
4. It fails, and `receiveCount >= maxReceives` → dead-letter with reason
   `'max-receives'`.
5. Otherwise → `queue.release(id, backoff(receiveCount))`, so the broker
   redelivers it later.

**Dead-lettering** means `await dlq.send({ id, body, receiveCount, reason, error })`
— `body` the original string, `error` the error's `message` (the parse error's
message for `'unparseable'`) — and only **then** `queue.ack(id)`. If
`dlq.send` rejects, do not ack: `queue.release(id, backoff(receiveCount))`
instead, so the message is kept.

`pollOnce()` resolves (never rejects, even if `ack` or `release` reject) to
counts for the batch:

```js
{ acked, deadLettered, released }
```

`acked` counts successes only; a dead-lettered message counts once, in
`deadLettered`, once its DLQ write and ack both succeeded; `released` counts
successful `release` calls. A message whose `ack` or `release` itself rejected
counts in none of them.

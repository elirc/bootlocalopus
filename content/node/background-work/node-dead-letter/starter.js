export function createConsumer({
  queue,
  dlq,
  handler,
  maxReceives = 5,
  isPermanent = () => false,
  backoff = (receiveCount) => 1000 * 2 ** (receiveCount - 1),
  batchSize = 10,
}) {
  return {
    async pollOnce() {
      // TODO: parse, dead-letter poison messages (unparseable, permanent,
      // too many receives), write to the DLQ *before* acking, release the rest
      // with backoff, and count the outcomes.
      // This version retries everything forever.
      const messages = await queue.receive(batchSize);
      const counts = { acked: 0, deadLettered: 0, released: 0 };
      for (const m of messages) {
        try {
          await handler(JSON.parse(m.body), { id: m.id, receiveCount: m.receiveCount });
          await queue.ack(m.id);
          counts.acked++;
        } catch {
          await queue.release(m.id, 0);
          counts.released++;
        }
      }
      return counts;
    },
  };
}

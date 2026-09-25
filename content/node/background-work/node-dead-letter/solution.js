export function createConsumer({
  queue,
  dlq,
  handler,
  maxReceives = 5,
  isPermanent = () => false,
  backoff = (receiveCount) => 1000 * 2 ** (receiveCount - 1),
  batchSize = 10,
}) {
  const messageOf = (error) => (error instanceof Error ? error.message : String(error));

  /** Resolves to 'acked' | 'deadLettered' | 'released'; rejects if the broker call fails. */
  async function deadLetter(message, reason, error) {
    const { id, body, receiveCount } = message;
    try {
      await dlq.send({ id, body, receiveCount, reason, error: messageOf(error) });
    } catch {
      // The DLQ is down: keep the message on the main queue rather than lose it.
      await queue.release(id, backoff(receiveCount));
      return 'released';
    }
    await queue.ack(id);
    return 'deadLettered';
  }

  async function handle(message) {
    const { id, body, receiveCount } = message;
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      return deadLetter(message, 'unparseable', error);
    }

    try {
      await handler(parsed, { id, receiveCount });
    } catch (error) {
      if (isPermanent(error)) return deadLetter(message, 'permanent', error);
      // receiveCount comes from the broker, so it survives consumer restarts.
      if (receiveCount >= maxReceives) return deadLetter(message, 'max-receives', error);
      await queue.release(id, backoff(receiveCount));
      return 'released';
    }
    await queue.ack(id);
    return 'acked';
  }

  return {
    async pollOnce() {
      const messages = await queue.receive(batchSize);
      const outcomes = await Promise.allSettled(messages.map(handle));
      const counts = { acked: 0, deadLettered: 0, released: 0 };
      for (const o of outcomes) if (o.status === 'fulfilled') counts[o.value]++;
      return counts;
    },
  };
}

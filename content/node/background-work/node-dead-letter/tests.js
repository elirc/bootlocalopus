/** An in-memory broker that records every call in one ordered log. */
function broker(messages, { failAck = () => false, failRelease = () => false, failDlq = () => false } = {}) {
  const log = [];
  const queue = {
    async receive(max) { log.push(['receive', max]); return messages.splice(0, max); },
    async ack(id) { log.push(['ack', id]); if (failAck(id)) throw new Error('ack failed'); },
    async release(id, delayMs) { log.push(['release', id, delayMs]); if (failRelease(id)) throw new Error('release failed'); },
  };
  const dead = [];
  const dlq = {
    async send(entry) {
      log.push(['dlq', entry.id]);
      if (failDlq(entry)) throw new Error('dlq unavailable');
      dead.push(entry);
    },
  };
  return { queue, dlq, log, dead };
}

const msg = (id, body, receiveCount = 1) => ({ id, body: typeof body === 'string' ? body : JSON.stringify(body), receiveCount });
const ops = (log, id) => log.filter((e) => e[1] === id).map((e) => e[0]);

class ValidationError extends Error {}

describe('the happy path', () => {
  it('parses the body, calls the handler with meta, and acks', async () => {
    const b = broker([msg('m1', { invoice: 7 }, 2)]);
    const seen = [];
    const c = solution.createConsumer({ ...b, handler: async (body, meta) => { seen.push([body, meta]); } });
    expect(await c.pollOnce()).toStrictEqual({ acked: 1, deadLettered: 0, released: 0 });
    expect(seen).toEqual([[{ invoice: 7 }, { id: 'm1', receiveCount: 2 }]]);
    expect(b.log[0]).toEqual(['receive', 10]);
    expect(ops(b.log, 'm1')).toEqual(['ack']);
  });

  it('receives batchSize messages', async () => {
    const b = broker([msg('a', 1), msg('b', 2), msg('c', 3)]);
    const c = solution.createConsumer({ ...b, handler: async () => {}, batchSize: 2 });
    expect(await c.pollOnce()).toStrictEqual({ acked: 2, deadLettered: 0, released: 0 });
    expect(b.log[0]).toEqual(['receive', 2]);
    expect(await c.pollOnce()).toStrictEqual({ acked: 1, deadLettered: 0, released: 0 });
  });
});

describe('transient failures', () => {
  it('releases with backoff(receiveCount) while under maxReceives', async () => {
    const b = broker([msg('a', 1, 1), msg('b', 2, 3), msg('c', 3, 4)]);
    const c = solution.createConsumer({ ...b, handler: async () => { throw new Error('timeout'); } });
    expect(await c.pollOnce()).toStrictEqual({ acked: 0, deadLettered: 0, released: 3 });
    expect(b.log.filter((e) => e[0] === 'release')).toEqual([['release', 'a', 1000], ['release', 'b', 4000], ['release', 'c', 8000]]);
    expect(b.dead).toEqual([]);
  });

  it('uses a custom backoff and treats a synchronous throw as a failure', async () => {
    const b = broker([msg('a', 1, 2)]);
    const c = solution.createConsumer({ ...b, handler: () => { throw new Error('sync'); }, backoff: (n) => n * 7 });
    expect(await c.pollOnce()).toStrictEqual({ acked: 0, deadLettered: 0, released: 1 });
    expect(b.log[1]).toEqual(['release', 'a', 14]);
  });
});

describe('dead-lettering', () => {
  it('moves a message aside once receiveCount reaches maxReceives', async () => {
    const b = broker([msg('a', { n: 1 }, 5), msg('b', { n: 2 }, 4)]);
    const c = solution.createConsumer({ ...b, handler: async () => { throw new Error('customer 9 not found'); } });
    expect(await c.pollOnce()).toStrictEqual({ acked: 0, deadLettered: 1, released: 1 });
    expect(b.dead).toStrictEqual([{ id: 'a', body: '{"n":1}', receiveCount: 5, reason: 'max-receives', error: 'customer 9 not found' }]);
    expect(ops(b.log, 'a')).toEqual(['dlq', 'ack']);
    expect(ops(b.log, 'b')).toEqual(['release']);
  });

  it('trusts the broker\'s receiveCount, not its own memory (a restarted consumer)', async () => {
    const b = broker([msg('a', 1, 3)]);
    const c = solution.createConsumer({ ...b, handler: async () => { throw new Error('x'); }, maxReceives: 3 });
    expect(await c.pollOnce()).toStrictEqual({ acked: 0, deadLettered: 1, released: 0 });
  });

  it('dead-letters permanent errors on the first delivery', async () => {
    const b = broker([msg('a', { amount: -1 }, 1)]);
    const c = solution.createConsumer({
      ...b,
      handler: async () => { throw new ValidationError('amount must be positive'); },
      isPermanent: (e) => e instanceof ValidationError,
    });
    expect(await c.pollOnce()).toStrictEqual({ acked: 0, deadLettered: 1, released: 0 });
    expect(b.dead[0]).toMatchObject({ id: 'a', reason: 'permanent', error: 'amount must be positive', receiveCount: 1 });
  });

  it('dead-letters an unparseable body without calling the handler', async () => {
    const b = broker([msg('a', '{"invoice": 7', 1), msg('b', { ok: true })]);
    const handled = [];
    const c = solution.createConsumer({ ...b, handler: async (body) => { handled.push(body); } });
    expect(await c.pollOnce()).toStrictEqual({ acked: 1, deadLettered: 1, released: 0 });
    expect(handled).toEqual([{ ok: true }]);
    expect(b.dead[0].reason).toBe('unparseable');
    expect(b.dead[0].body).toBe('{"invoice": 7');
    expect(typeof b.dead[0].error).toBe('string');
    expect(b.dead[0].error.length).toBeGreaterThan(0);
  });

  it('keeps the message when the DLQ write fails: release, never ack', async () => {
    const b = broker([msg('a', 1, 5)], { failDlq: () => true });
    const c = solution.createConsumer({ ...b, handler: async () => { throw new Error('x'); } });
    expect(await c.pollOnce()).toStrictEqual({ acked: 0, deadLettered: 0, released: 1 });
    expect(ops(b.log, 'a')).toEqual(['dlq', 'release']);
    expect(b.log.find((e) => e[0] === 'release')).toEqual(['release', 'a', 16000]);
  });
});

describe('isolation', () => {
  it('handles messages independently: a slow one does not hold up the others', async () => {
    let releaseSlow;
    const gate = new Promise((r) => { releaseSlow = r; });
    const b = broker([msg('slow', { k: 's' }), msg('fast', { k: 'f' })]);
    const c = solution.createConsumer({ ...b, handler: async (body) => { if (body.k === 's') await gate; } });
    const done = c.pollOnce();
    for (let i = 0; i < 20 && !ops(b.log, 'fast').includes('ack'); i++) await new Promise((r) => setImmediate(r));
    expect(ops(b.log, 'fast')).toEqual(['ack']);
    releaseSlow();
    expect(await done).toStrictEqual({ acked: 2, deadLettered: 0, released: 0 });
  });

  it('resolves even when ack and release fail, counting only what succeeded', async () => {
    const b = broker([msg('a', 1), msg('b', 2), msg('c', 3), msg('d', 4, 9)], {
      failAck: (id) => id === 'a' || id === 'd',
      failRelease: (id) => id === 'b',
    });
    const c = solution.createConsumer({ ...b, handler: async (n) => { if (n !== 1) throw new Error('no'); } });
    expect(await c.pollOnce()).toStrictEqual({ acked: 0, deadLettered: 0, released: 1 });
    expect(ops(b.log, 'd')).toEqual(['dlq', 'ack']);
  });
});

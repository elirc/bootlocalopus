// node-db lessons share one database across tests, with no per-test
// transaction: every test starts from a reset.

async function inTransaction() {
  try {
    await db.query('savepoint __grader_probe');
  } catch (e) {
    return /aborted/i.test(String(e && e.message));
  }
  await db.query('release savepoint __grader_probe');
  return true;
}

async function reset() {
  if (await inTransaction()) await db.query('rollback');
  await db.exec('delete from outbox; delete from orders;');
}

beforeEach(reset);
afterEach(async () => {
  if (await inTransaction()) await db.query('rollback');
});

function spyConn(onQuery) {
  const calls = [];
  const conn = {
    async query(text, params) {
      const call = { text: String(text), params: Array.isArray(params) ? [...params] : [] };
      calls.push(call);
      if (onQuery) await onQuery(call, calls);
      return db.query(text, params);
    },
  };
  return { conn, calls };
}

const isBegin = (c) => /^\s*(begin|start\s+transaction)\b/i.test(c.text);
const isCommit = (c) => /^\s*(commit|end)\b/i.test(c.text);
const isRollback = (c) => /^\s*rollback\b/i.test(c.text) && !/to\s+savepoint/i.test(c.text);
const isInsert = (table) => (c) => new RegExp('^\\s*insert\\s+into\\s+' + table + '\\b', 'i').test(c.text);

async function count(table) {
  return (await q(`select count(*)::int as c from ${table}`))[0].c;
}
async function rejectionOf(run) {
  try { await run(); } catch (e) { return e; }
  return fail('expected a rejection, but it resolved');
}
const outboxRows = () => q('select id, topic, payload, published_at, attempts, last_error from outbox order by id');

/** Inserts `n` pending events directly; returns their ids in order. */
async function seed(n) {
  for (let i = 1; i <= n; i++) {
    await q("insert into outbox (topic, payload) values ('order.placed', $1::jsonb)",
      [JSON.stringify({ orderId: 1000 + i, customer: 'c' + i, totalCents: i * 100 })]);
  }
  return (await outboxRows()).map((r) => r.id);
}

describe('placeOrder', () => {
  it('writes the order and its event, and resolves to { orderId }', async () => {
    const { conn } = spyConn();
    const result = await solution.placeOrder(conn, { customer: 'acme', totalCents: 1250 });
    const orders = await q('select id, customer, total_cents from orders');
    expect(orders).toHaveLength(1);
    expect(result).toStrictEqual({ orderId: orders[0].id });
    expect(orders[0]).toMatchObject({ customer: 'acme', total_cents: 1250 });
    const events = await outboxRows();
    expect(events).toHaveLength(1);
    expect(events[0].topic).toBe('order.placed');
    expect(events[0].payload).toEqual({ orderId: orders[0].id, customer: 'acme', totalCents: 1250 });
    expect(events[0].published_at).toBeNull();
    assert(!(await inTransaction()), 'the transaction is still open after placeOrder() resolved');
  });

  it('puts both inserts inside one BEGIN … COMMIT, with values as parameters', async () => {
    const { conn, calls } = spyConn();
    await solution.placeOrder(conn, { customer: 'zq-customer', totalCents: 4321 });
    expect(calls.filter(isBegin)).toHaveLength(1);
    expect(calls.filter(isCommit)).toHaveLength(1);
    const begin = calls.findIndex(isBegin);
    const commit = calls.findIndex(isCommit);
    const orderInsert = calls.findIndex(isInsert('orders'));
    const outboxInsert = calls.findIndex(isInsert('outbox'));
    assert(orderInsert > begin && orderInsert < commit, 'the orders insert is outside the transaction');
    assert(outboxInsert > begin && outboxInsert < commit, 'the outbox insert is outside the transaction');
    for (const { text } of calls) {
      assert(!text.includes('zq-customer') && !text.includes('4321'), `a value was put into SQL text:\n${text}`);
    }
  });

  it('leaves no event behind when the order violates its CHECK', async () => {
    const { conn, calls } = spyConn();
    const err = await rejectionOf(() => solution.placeOrder(conn, { customer: 'acme', totalCents: 0 }));
    expect(err).toBeInstanceOf(Error);
    assert(calls.some(isRollback), 'expected a ROLLBACK after the failure');
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
    expect(await count('orders')).toBe(0);
    expect(await count('outbox')).toBe(0);
  });

  it('leaves no order behind when the outbox insert fails, and rethrows that error', async () => {
    const injected = new Error('injected: outbox insert failed');
    const { conn, calls } = spyConn((call) => { if (isInsert('outbox')(call)) throw injected; });
    const err = await rejectionOf(() => solution.placeOrder(conn, { customer: 'acme', totalCents: 500 }));
    assert(err === injected, `expected the original error, got ${err && err.message}`);
    assert(calls.some(isRollback), 'expected a ROLLBACK after the failure');
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
    expect(await count('orders')).toBe(0);
    expect(await count('outbox')).toBe(0);
  });
});

describe('relayOutbox', () => {
  it('publishes pending events oldest first and marks them', async () => {
    const ids = await seed(3);
    const sent = [];
    const result = await solution.relayOutbox(db, async (event) => { sent.push(event); });
    expect(result).toStrictEqual({ published: 3, failedId: null });
    expect(sent.map((e) => e.id)).toEqual(ids);
    expect(sent[0]).toStrictEqual({ id: ids[0], topic: 'order.placed', payload: sent[0].payload });
    expect(typeof sent[0].payload).toBe('object');
    expect(sent[0].payload.customer).toBe('c1');
    expect(sent[2].payload.totalCents).toBe(300);
    for (const row of await outboxRows()) expect(row.published_at).not.toBeNull();
    assert(!(await inTransaction()), 'the relay left a transaction open');
  });

  it('never republishes a published event', async () => {
    await seed(2);
    await solution.relayOutbox(db, async () => {});
    const sent = [];
    expect(await solution.relayOutbox(db, async (e) => { sent.push(e.id); })).toStrictEqual({ published: 0, failedId: null });
    expect(sent).toEqual([]);
  });

  it('takes at most batchSize events per call', async () => {
    const ids = await seed(5);
    const sent = [];
    const publish = async (e) => { sent.push(e.id); };
    expect(await solution.relayOutbox(db, publish, { batchSize: 2 })).toStrictEqual({ published: 2, failedId: null });
    expect(await solution.relayOutbox(db, publish, { batchSize: 2 })).toStrictEqual({ published: 2, failedId: null });
    expect(sent).toEqual(ids.slice(0, 4));
  });

  it('marks each event as soon as it is published, not at the end', async () => {
    const ids = await seed(3);
    const seenPublished = [];
    await solution.relayOutbox(db, async (e) => {
      const rows = await q('select id from outbox where published_at is not null order by id');
      seenPublished.push(rows.map((r) => r.id));
    });
    expect(seenPublished).toEqual([[], [ids[0]], [ids[0], ids[1]]]);
  });

  it('on failure: keeps earlier marks, records the error, and stops', async () => {
    const ids = await seed(5);
    const sent = [];
    const result = await solution.relayOutbox(db, async (e) => {
      if (e.id === ids[2]) throw new Error('broker unavailable');
      sent.push(e.id);
    });
    expect(result).toStrictEqual({ published: 2, failedId: ids[2] });
    expect(sent).toEqual([ids[0], ids[1]]);
    const rows = await outboxRows();
    expect(rows.map((r) => r.published_at !== null)).toEqual([true, true, false, false, false]);
    expect(rows[2]).toMatchObject({ attempts: 1, last_error: 'broker unavailable' });
    expect(rows[3]).toMatchObject({ attempts: 0, last_error: null });
    assert(!(await inTransaction()), 'the relay left a transaction open');

    // The next run resumes from the failed event, still in order.
    const later = [];
    expect(await solution.relayOutbox(db, async (e) => { later.push(e.id); })).toStrictEqual({ published: 3, failedId: null });
    expect(later).toEqual(ids.slice(2));
  });

  it('counts repeated failures on the same event', async () => {
    const ids = await seed(1);
    const publish = async () => { throw new Error('still down'); };
    await solution.relayOutbox(db, publish);
    await solution.relayOutbox(db, publish);
    const [row] = await outboxRows();
    expect(row).toMatchObject({ id: ids[0], attempts: 2, last_error: 'still down', published_at: null });
  });
});

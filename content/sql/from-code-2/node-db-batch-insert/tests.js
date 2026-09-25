// node-db: one shared database; every test starts from a reset.
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
  await db.exec(`
    truncate events restart identity;
    insert into events (external_id, kind, occurred_at, payload) values
      ('ext-existing', 'signup', '2024-01-01T00:00:00Z', '{"plan": "free"}');
  `);
}
beforeEach(reset);
afterEach(async () => { if (await inTransaction()) await db.query('rollback'); });

function spyConn() {
  const calls = [];
  const conn = {
    async query(text, params) {
      calls.push({ text: String(text), params: Array.isArray(params) ? params : [] });
      return db.query(text, params);
    },
  };
  return { conn, calls, inserts: () => calls.filter((c) => /^\s*(insert|with)\b/i.test(c.text)) };
}

const T0 = Date.parse('2024-05-01T00:00:00Z');
const makeEvents = (n, prefix = 'e') => Array.from({ length: n }, (_, i) => ({
  externalId: `${prefix}-${String(i).padStart(6, '0')}`,
  kind: ['click', 'view', 'purchase'][i % 3],
  occurredAt: new Date(T0 + i * 1000),
  payload: { n: i, tags: [`t${i % 5}`], note: i % 7 === 0 ? "it's \"quoted\"" : null },
}));

async function count() {
  return (await q('select count(*)::int as n from events'))[0].n;
}
async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}

describe('importEvents', () => {
  it('inserts in batches: 2,500 events at batchSize 1000 is 3 INSERTs', async () => {
    const spy = spyConn();
    const events = makeEvents(2500);
    const ids = await solution.importEvents(spy.conn, events, { batchSize: 1000 });
    expect(spy.inserts()).toHaveLength(3);
    expect(ids).toHaveLength(2500);
    expect(await count()).toBe(2501);
  });

  it('defaults to batches of 500', async () => {
    const spy = spyConn();
    await solution.importEvents(spy.conn, makeEvents(1001));
    expect(spy.inserts()).toHaveLength(3);
  });

  it('returns ids aligned with the input: ids[i] is events[i]\'s row', async () => {
    const events = makeEvents(1200).reverse();
    const ids = await solution.importEvents(spyConn().conn, events, { batchSize: 250 });
    const rows = await q('select id, external_id from events');
    const byExt = new Map(rows.map((r) => [r.external_id, r.id]));
    events.forEach((e, i) => {
      assert(ids[i] === byExt.get(e.externalId), `ids[${i}] is ${ids[i]}, but ${e.externalId} got id ${byExt.get(e.externalId)}`);
    });
  });

  it('stores every column faithfully (timestamps, JSON with quotes)', async () => {
    const events = makeEvents(8);
    await solution.importEvents(spyConn().conn, events);
    const rows = await q("select external_id, kind, occurred_at, payload from events where external_id like 'e-%' order by external_id");
    expect(rows).toHaveLength(8);
    rows.forEach((r, i) => {
      expect(r.kind).toBe(events[i].kind);
      expect(r.occurred_at.getTime()).toBe(events[i].occurredAt.getTime());
      expect(r.payload).toEqual(events[i].payload);
    });
  });

  it('keeps every value out of the SQL text', async () => {
    const spy = spyConn();
    await solution.importEvents(spy.conn, [{ externalId: 'ext-zq91', kind: 'kind-zq92', occurredAt: new Date(T0), payload: { k: 'zq93' } }]);
    for (const { text } of spy.calls) {
      for (const v of ['zq91', 'zq92', 'zq93']) assert(!text.includes(v), `a value is in the SQL text:\n${text}`);
    }
  });

  it('copes with a batch far larger than 65,535 parameters would allow as VALUES', async () => {
    const spy = spyConn();
    const ids = await solution.importEvents(spy.conn, makeEvents(17000, 'big'), { batchSize: 17000 });
    expect(ids).toHaveLength(17000);
    expect(await count()).toBe(17001);
    for (const c of spy.calls) {
      const flat = c.params.length;
      assert(flat <= 65535, `one statement carried ${flat} parameters`);
    }
  });

  it('is all or nothing: a duplicate in the third batch leaves no rows from the first two', async () => {
    const events = makeEvents(250);
    events[230] = { ...events[230], externalId: 'ext-existing' };
    const err = await rejectionOf(() => solution.importEvents(spyConn().conn, events, { batchSize: 100 }));
    expect(err.code).toBe('23505');
    expect(await count()).toBe(1);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('resolves to [] for no events, without touching the database', async () => {
    const spy = spyConn();
    expect(await solution.importEvents(spy.conn, [])).toEqual([]);
    expect(spy.calls).toEqual([]);
  });

  it('rejects invalid input with a RangeError before any query', async () => {
    const ok = makeEvents(3);
    const bad = [
      [[ok[0], { ...ok[1], externalId: ok[0].externalId }]],
      [[{ ...ok[0], externalId: '' }]],
      [[{ ...ok[0], kind: 7 }]],
      [[{ ...ok[0], occurredAt: '2024-05-01' }]],
      [[{ ...ok[0], occurredAt: new Date('nope') }]],
      [[{ ...ok[0], payload: null }]],
      [[{ ...ok[0], payload: [1, 2] }]],
      [[null]],
      ['not-an-array'],
      [ok, { batchSize: 0 }],
      [ok, { batchSize: 2.5 }],
    ];
    for (const [events, opts] of bad) {
      const spy = spyConn();
      const err = await rejectionOf(() => solution.importEvents(spy.conn, events, opts));
      assert(err instanceof RangeError, `expected a RangeError, got ${err && err.name}: ${err && err.message}`);
      expect(spy.calls).toEqual([]);
    }
    expect(await count()).toBe(1);
  });
});

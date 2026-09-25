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
    update customers set email_normalized = case when id % 10 = 0 then 'kept-' || id else null end;
  `);
}
beforeEach(reset);
afterEach(async () => { if (await inTransaction()) await db.query('rollback'); });

const TOTAL = 2000;
const PENDING = 1800;

async function filled() {
  return (await db.query('select count(*)::int as n from customers where email_normalized is not null')).rows[0].n;
}

/**
 * A connection with only `query`. After every statement that leaves the
 * connection outside a transaction (i.e. committed), it measures how many
 * rows were filled since the previous commit. `before(text, n)` may throw.
 */
function spyConn(before) {
  const log = { statements: 0, commits: [], order: [] };
  let committed = null;
  const conn = {
    async query(text, params) {
      text = String(text);
      log.statements += 1;
      log.order.push('sql');
      if (before) await before(text, log.statements);
      const res = await db.query(text, params);
      if (committed !== null && !(await inTransaction())) {
        const now = await filled();
        log.commits.push(now - committed);
        committed = now;
      }
      return res;
    },
  };
  return {
    conn,
    log,
    async start() { committed = await filled(); },
  };
}

function fakeSleep(log) {
  const delays = [];
  return {
    delays,
    sleep: async (ms) => { delays.push(ms); if (log) log.order.push('sleep'); },
  };
}

async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}

async function expectAllCorrect() {
  const wrong = await db.query(`
    select id, email, email_normalized from customers
     where email_normalized is distinct from
           case when id % 10 = 0 then 'kept-' || id else lower(btrim(email)) end
     limit 3`);
  assert(wrong.rows.length === 0, `wrong or missing values, e.g. ${JSON.stringify(wrong.rows)}`);
}

describe('backfillNormalizedEmails', () => {
  it('fills every NULL row with lower(btrim(email)) and resolves to { updated }', async () => {
    const spy = spyConn();
    await spy.start();
    const out = await solution.backfillNormalizedEmails(spy.conn, { batchSize: 300 });
    expect(out).toEqual({ updated: PENDING });
    await expectAllCorrect();
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('never overwrites a value that is already there', async () => {
    await solution.backfillNormalizedEmails(spyConn().conn, { batchSize: 300 });
    const kept = await db.query("select count(*)::int as n from customers where email_normalized like 'kept-%'");
    expect(kept.rows[0].n).toBe(TOTAL - PENDING);
  });

  it('commits at most batchSize rows at a time', async () => {
    const spy = spyConn();
    await spy.start();
    await solution.backfillNormalizedEmails(spy.conn, { batchSize: 300 });
    const biggest = Math.max(...spy.log.commits);
    assert(biggest <= 300, `one commit filled ${biggest} rows (batchSize was 300)`);
    expect(spy.log.commits.reduce((a, b) => a + b, 0)).toBe(PENDING);
  });

  it('defaults to batches of 500', async () => {
    const spy = spyConn();
    await spy.start();
    await solution.backfillNormalizedEmails(spy.conn);
    expect(Math.max(...spy.log.commits)).toBe(500);
  });

  it('walks the table with a cursor: a bounded number of statements', async () => {
    const spy = spyConn();
    await spy.start();
    await solution.backfillNormalizedEmails(spy.conn, { batchSize: 300 });
    const bound = Math.ceil(TOTAL / 300) + 2;
    assert(spy.log.statements <= bound, `${spy.log.statements} statements for ${TOTAL} rows at 300 per batch (expected at most ${bound})`);
  });

  it('pauses between batches when asked, and only then', async () => {
    const spy = spyConn();
    await spy.start();
    const { sleep, delays } = fakeSleep(spy.log);
    await solution.backfillNormalizedEmails(spy.conn, { batchSize: 400, pauseMs: 25, sleep });
    assert(delays.length >= 4, `expected a pause between batches, got ${delays.length} pauses`);
    expect(delays.every((ms) => ms === 25)).toBe(true);
    expect(spy.log.order[0]).toBe('sql');
    assert(!spy.log.order.join(',').includes('sleep,sleep'), 'two pauses in a row, with no batch between them');
    const quiet = fakeSleep();
    await reset();
    await solution.backfillNormalizedEmails(spyConn().conn, { batchSize: 400, sleep: quiet.sleep });
    expect(quiet.delays).toEqual([]);
  });

  it('keeps the batches that finished when a later one fails, and a rerun completes the job', async () => {
    const injected = new Error('injected: statement timeout');
    let writes = 0;
    const spy = spyConn((text) => {
      if (/^\s*(update|with)\b/i.test(text)) {
        writes += 1;
        if (writes === 3) throw injected;
      }
    });
    await spy.start();
    const err = await rejectionOf(() => solution.backfillNormalizedEmails(spy.conn, { batchSize: 300 }));
    expect(err).toBe(injected);
    expect(await filled()).toBe(TOTAL - PENDING + 600);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');

    const again = await solution.backfillNormalizedEmails(spyConn().conn, { batchSize: 300 });
    expect(again).toEqual({ updated: PENDING - 600 });
    await expectAllCorrect();
  });

  it('does nothing, cheaply, when there is nothing left to do', async () => {
    await solution.backfillNormalizedEmails(spyConn().conn, { batchSize: 300 });
    const spy = spyConn();
    await spy.start();
    expect(await solution.backfillNormalizedEmails(spy.conn, { batchSize: 300 })).toEqual({ updated: 0 });
    assert(spy.log.statements <= Math.ceil(TOTAL / 300) + 2, 'too many statements for an empty run');
  });

  it('rejects a bad batchSize or pauseMs with a RangeError before any query', async () => {
    for (const opts of [{ batchSize: 0 }, { batchSize: 2.5 }, { batchSize: '100' }, { pauseMs: -1 }, { pauseMs: 1.5 }]) {
      const spy = spyConn();
      const err = await rejectionOf(() => solution.backfillNormalizedEmails(spy.conn, opts));
      assert(err instanceof RangeError, `${JSON.stringify(opts)}: expected a RangeError, got ${err && err.name}`);
      expect(spy.log.statements).toBe(0);
    }
  });
});

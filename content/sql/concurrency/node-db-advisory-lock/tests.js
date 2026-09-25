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
  await db.query('select pg_advisory_unlock_all()');
  await db.exec('delete from invoices; delete from invoice_runs;');
}
beforeEach(reset);
afterEach(async () => {
  if (await inTransaction()) await db.query('rollback');
  await db.query('select pg_advisory_unlock_all()');
});

/** The advisory locks this connection holds right now, as comparable keys. */
async function advisoryLocks() {
  const r = await db.query(
    `select classid::text || ':' || objid::text || ':' || objsubid::text as key
       from pg_locks
      where locktype = 'advisory' and pid = pg_backend_pid() and granted
      order by 1`,
  );
  return r.rows.map((row) => row.key);
}

/**
 * A connection with only `query`. With `heldElsewhere`, it plays a second
 * server that already holds every advisory lock: pg_try_advisory_* calls
 * answer false (and take nothing). Blocking lock calls are not intercepted.
 * `failOn(text)` may throw to inject a failure before a statement runs.
 */
function spyConn({ heldElsewhere = false, failOn } = {}) {
  const calls = [];
  const conn = {
    async query(text, params) {
      text = String(text);
      calls.push(text);
      if (failOn) failOn(text);
      const res = await db.query(text, params);
      if (heldElsewhere && /pg_try_advisory/i.test(text)) {
        // Undo whatever was acquired: session-level locks now, transaction-level
        // ones are released by the caller's ROLLBACK.
        await db.query('select pg_advisory_unlock_all()');
        return {
          ...res,
          rows: res.rows.map((row) => Object.fromEntries(Object.keys(row).map((k) => [k, false]))),
        };
      }
      return res;
    },
  };
  return { conn, calls };
}

async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}

async function counts() {
  const r = await q(`select (select count(*)::int from invoices) as invoices,
                            (select count(*)::int from invoice_runs) as runs`);
  return r[0];
}

describe('runExclusive', () => {
  it('holds an advisory lock while work runs, and resolves to { ran: true, result }', async () => {
    const { conn } = spyConn();
    let during = null;
    let inTx = null;
    const out = await solution.runExclusive(conn, 'reports', async (c) => {
      during = await advisoryLocks();
      inTx = await inTransaction();
      return 42;
    });
    expect(out).toStrictEqual({ ran: true, result: 42 });
    assert(during && during.length >= 1, 'no advisory lock was held while work ran');
    expect(inTx).toBe(true);
    expect(await advisoryLocks()).toEqual([]);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('commits what work wrote', async () => {
    await solution.runExclusive(spyConn().conn, 'reports', async (c) => {
      await c.query("insert into invoice_runs (day, invoiced) values ('2024-01-01', 0)");
    });
    expect((await counts()).runs).toBe(1);
  });

  it('uses the same lock for the same name and different locks for different names', async () => {
    const keyFor = async (name) => {
      let key = null;
      await solution.runExclusive(spyConn().conn, name, async () => { key = (await advisoryLocks()).join(','); });
      return key;
    };
    const a1 = await keyFor('nightly-export');
    const a2 = await keyFor('nightly-export');
    const b = await keyFor('cache-warmup');
    expect(a1).toBe(a2);
    assert(a1 !== b, 'two different names took the same advisory lock');
  });

  it('does not wait and does not run work when another server holds the lock', async () => {
    const { conn } = spyConn({ heldElsewhere: true });
    let ran = false;
    const out = await solution.runExclusive(conn, 'reports', async () => { ran = true; });
    assert(!ran, 'work ran although another server holds the lock (use a pg_try_advisory_* function, which answers instead of waiting)');
    expect(out).toStrictEqual({ ran: false });
    expect(await advisoryLocks()).toEqual([]);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('rolls back, releases the lock and rethrows the original error when work throws', async () => {
    const boom = new Error('work failed');
    const err = await rejectionOf(() => solution.runExclusive(spyConn().conn, 'reports', async (c) => {
      await c.query("insert into invoice_runs (day, invoiced) values ('2024-01-02', 0)");
      throw boom;
    }));
    expect(err).toBe(boom);
    expect((await counts()).runs).toBe(0);
    expect(await advisoryLocks()).toEqual([]);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
    // And the lock is free for the next run.
    expect(await solution.runExclusive(spyConn().conn, 'reports', async () => 'again')).toStrictEqual({ ran: true, result: 'again' });
  });

  it('rejects an empty or non-string name with a RangeError before any query', async () => {
    for (const name of ['', undefined, 42]) {
      const { conn, calls } = spyConn();
      const err = await rejectionOf(() => solution.runExclusive(conn, name, async () => 1));
      assert(err instanceof RangeError, `name ${JSON.stringify(name)}: expected a RangeError, got ${err && err.name}`);
      expect(calls).toEqual([]);
    }
  });
});

describe('runDailyInvoicing', () => {
  it('invoices every active subscription once and records the run', async () => {
    const out = await solution.runDailyInvoicing(spyConn().conn, '2024-06-01');
    expect(out).toStrictEqual({ status: 'ran', invoiced: 3 });
    const rows = await q("select subscription_id, amount_cents from invoices where day = '2024-06-01' order by subscription_id");
    expect(rows).toEqual([
      { subscription_id: 1, amount_cents: 1200 },
      { subscription_id: 2, amount_cents: 900 },
      { subscription_id: 4, amount_cents: 2400 },
    ]);
    const runs = await q("select invoiced from invoice_runs where day = '2024-06-01'");
    expect(runs).toEqual([{ invoiced: 3 }]);
  });

  it('a later run for the same day does nothing: { status: \'already-ran\' }', async () => {
    await solution.runDailyInvoicing(spyConn().conn, '2024-06-01');
    const again = await solution.runDailyInvoicing(spyConn().conn, '2024-06-01');
    expect(again).toStrictEqual({ status: 'already-ran' });
    expect(await counts()).toEqual({ invoices: 3, runs: 1 });
    const next = await solution.runDailyInvoicing(spyConn().conn, '2024-06-02');
    expect(next).toStrictEqual({ status: 'ran', invoiced: 3 });
  });

  it('resolves to { status: \'locked\' } and writes nothing while another server is running it', async () => {
    const out = await solution.runDailyInvoicing(spyConn({ heldElsewhere: true }).conn, '2024-06-01');
    expect(out).toStrictEqual({ status: 'locked' });
    expect(await counts()).toEqual({ invoices: 0, runs: 0 });
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('leaves no half-done day when it fails before recording the run', async () => {
    const injected = new Error('injected: connection reset');
    const { conn } = spyConn({ failOn: (t) => { if (/insert\s+into\s+invoice_runs/i.test(t)) throw injected; } });
    const err = await rejectionOf(() => solution.runDailyInvoicing(conn, '2024-06-01'));
    expect(err).toBe(injected);
    expect(await counts()).toEqual({ invoices: 0, runs: 0 });
    expect(await advisoryLocks()).toEqual([]);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
    expect(await solution.runDailyInvoicing(spyConn().conn, '2024-06-01')).toStrictEqual({ status: 'ran', invoiced: 3 });
  });
});

// node-db lessons share one database across tests: every test starts from a reset.

async function inTransaction() {
  try {
    await db.query('savepoint __grader_probe');
  } catch (e) {
    return /aborted/i.test(String(e && e.message));
  }
  await db.query('release savepoint __grader_probe');
  return true;
}

beforeEach(async () => {
  if (await inTransaction()) await db.query('rollback');
  await db.exec('delete from job_locks;');
});

function spyConn(afterQuery) {
  const calls = [];
  const conn = {
    async query(text, params) {
      const call = { text: String(text), params: Array.isArray(params) ? [...params] : [] };
      calls.push(call);
      const result = await db.query(text, params);
      if (afterQuery) await afterQuery(call, calls);
      return result;
    },
  };
  return { conn, calls };
}

// A fixed instant far from the real clock: code that uses the database's now() gets it wrong.
const T0 = new Date('2031-03-04T02:00:00.000Z');
const at = (ms) => new Date(T0.getTime() + ms);
const lock = (owner, ms = 0, extra = {}) => ({ name: 'charge-renewals', owner, ttlMs: 60_000, now: at(ms), ...extra });

async function row() {
  const rows = await q('select owner, locked_until from job_locks where name = $1', ['charge-renewals']);
  return rows[0];
}
async function rejectionOf(run) {
  try { await run(); } catch (e) { return e; }
  return fail('expected a rejection, but it resolved');
}

describe('tryAcquire', () => {
  it('takes a free lock until now + ttlMs', async () => {
    expect(await solution.tryAcquire(db, lock('replica-a'))).toBe(true);
    const r = await row();
    expect(r.owner).toBe('replica-a');
    expect(new Date(r.locked_until).toISOString()).toBe(at(60_000).toISOString());
  });

  it('refuses a lock another replica holds, without touching it', async () => {
    await solution.tryAcquire(db, lock('replica-a'));
    expect(await solution.tryAcquire(db, lock('replica-b', 59_999))).toBe(false);
    const r = await row();
    expect(r.owner).toBe('replica-a');
    expect(new Date(r.locked_until).toISOString()).toBe(at(60_000).toISOString());
  });

  it('takes over an expired lock, at exactly locked_until too', async () => {
    await solution.tryAcquire(db, lock('replica-a'));
    expect(await solution.tryAcquire(db, lock('replica-b', 60_000))).toBe(true);
    const r = await row();
    expect(r.owner).toBe('replica-b');
    expect(new Date(r.locked_until).toISOString()).toBe(at(120_000).toISOString());
  });

  it('lets the holder renew its own lock', async () => {
    await solution.tryAcquire(db, lock('replica-a'));
    expect(await solution.tryAcquire(db, lock('replica-a', 30_000))).toBe(true);
    expect(new Date((await row()).locked_until).toISOString()).toBe(at(90_000).toISOString());
  });

  it('keeps different job names apart', async () => {
    await solution.tryAcquire(db, lock('replica-a'));
    expect(await solution.tryAcquire(db, lock('replica-b', 0, { name: 'send-digests' }))).toBe(true);
  });

  it('uses one statement, with every value as a parameter', async () => {
    const { conn, calls } = spyConn();
    await solution.tryAcquire(conn, lock('replica-zq9'));
    expect(calls).toHaveLength(1);
    for (const { text } of calls) {
      assert(!text.includes('replica-zq9') && !text.includes('charge-renewals') && !text.includes('2031'), `a value is in the SQL text:\n${text}`);
    }
  });

  it('never steals a valid lock taken by another replica mid-call, and never throws', async () => {
    // Another replica acquires right after your first query returns.
    let otherGotIt = false;
    const { conn } = spyConn(async (call, calls) => {
      if (calls.length === 1) {
        const r = await db.query(
          "insert into job_locks (name, owner, locked_until) values ('charge-renewals', 'replica-b', $1) on conflict (name) do nothing returning owner",
          [at(60_000)],
        );
        otherGotIt = r.rows.length === 1;
      }
    });
    const got = await solution.tryAcquire(conn, lock('replica-a'));
    const holder = (await row()).owner;
    expect(got).toBe(holder === 'replica-a');
    if (otherGotIt) {
      // replica-b took a free lock, valid for a minute: replica-a must not take it from under it.
      assert(got === false && holder === 'replica-b', 'replica-a overwrote a lock replica-b had just acquired: both will run the job');
    }
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });
});

describe('release', () => {
  it('deletes only the holder\'s lock', async () => {
    await solution.tryAcquire(db, lock('replica-a'));
    expect(await solution.release(db, { name: 'charge-renewals', owner: 'replica-b' })).toBe(false);
    expect((await row()).owner).toBe('replica-a');
    expect(await solution.release(db, { name: 'charge-renewals', owner: 'replica-a' })).toBe(true);
    expect(await row()).toBeUndefined();
    expect(await solution.release(db, { name: 'charge-renewals', owner: 'replica-a' })).toBe(false);
  });

  it('does not delete a lock that was taken over after expiry', async () => {
    await solution.tryAcquire(db, lock('replica-a'));
    await solution.tryAcquire(db, lock('replica-b', 61_000));
    expect(await solution.release(db, { name: 'charge-renewals', owner: 'replica-a' })).toBe(false);
    expect((await row()).owner).toBe('replica-b');
  });
});

describe('runExclusive', () => {
  it('runs fn once while holding the lock, then releases it', async () => {
    let heldDuring;
    const r = await solution.runExclusive(db, lock('replica-a'), async () => {
      heldDuring = (await row()).owner;
      return 42;
    });
    expect(r).toStrictEqual({ ran: true, result: 42 });
    expect(heldDuring).toBe('replica-a');
    expect(await row()).toBeUndefined();
  });

  it('does not call fn when another replica holds the lock', async () => {
    await solution.tryAcquire(db, lock('replica-b'));
    let called = false;
    const r = await solution.runExclusive(db, lock('replica-a', 1000), async () => { called = true; });
    expect(r).toStrictEqual({ ran: false });
    expect(called).toBe(false);
    expect((await row()).owner).toBe('replica-b');
  });

  it('releases and rethrows the original error when fn fails', async () => {
    const boom = new Error('card processor down');
    const err = await rejectionOf(() => solution.runExclusive(db, lock('replica-a'), async () => { throw boom; }));
    expect(err).toBe(boom);
    expect(await row()).toBeUndefined();
  });

  it('three replicas at 02:00: the job runs exactly once', async () => {
    let runs = 0;
    const results = [];
    for (const owner of ['replica-a', 'replica-b', 'replica-c']) {
      // Each replica's fn takes a while: they overlap in time.
      results.push(solution.runExclusive(db, lock(owner), async () => { runs++; await new Promise((r) => setTimeout(r, 20)); return owner; }));
    }
    const settled = await Promise.all(results);
    expect(runs).toBe(1);
    expect(settled.filter((r) => r.ran)).toHaveLength(1);
  });
});

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
    truncate jobs restart identity;
    insert into jobs (queue, payload, status, run_at, attempts, locked_until) values
      ('emails',  '{"to": "ada"}',   'queued',  '2024-05-01T11:50:00Z', 0, null),
      ('emails',  '{"to": "bob"}',   'queued',  '2024-05-01T11:55:00Z', 0, null),
      ('emails',  '{"to": "cy"}',    'queued',  '2024-05-01T12:10:00Z', 0, null),
      ('reports', '{"month": "04"}', 'queued',  '2024-05-01T11:40:00Z', 0, null),
      ('emails',  '{"to": "dee"}',   'done',    '2024-05-01T11:30:00Z', 1, null),
      ('emails',  '{"to": "eve"}',   'running', '2024-05-01T11:45:00Z', 1, '2024-05-01T11:59:00Z'),
      ('emails',  '{"to": "fay"}',   'running', '2024-05-01T11:44:00Z', 1, '2024-05-01T12:05:00Z'),
      ('emails',  '{"to": "gus"}',   'dead',    '2024-05-01T11:20:00Z', 5, null);
  `);
}
beforeEach(reset);
afterEach(async () => { if (await inTransaction()) await db.query('rollback'); });

const NOON = new Date('2024-05-01T12:00:00Z');
const at = (iso) => new Date(iso);
const MIN = 60_000;

/** A connection exposing only `query`, recording every SQL text. */
function spyConn() {
  const calls = [];
  const conn = {
    async query(text, params) {
      calls.push(String(text));
      return db.query(text, params);
    },
  };
  return { conn, calls };
}

/**
 * A second worker that claims whatever your first read of `jobs` returned,
 * right after that read and before your next statement — unless the rows are
 * locked by your open transaction, in which case (like Postgres) it skips them.
 */
function withRivalWorker(now) {
  const stolen = [];
  let fired = false;
  const conn = {
    async query(text, params) {
      text = String(text);
      const res = await db.query(text, params);
      const isRead = /\bjobs\b/i.test(text) && !/\b(update\s+(only\s+)?jobs|insert|delete)\b/i.test(text);
      const ids = (res.rows || []).map((r) => r.id).filter((id) => typeof id === 'number');
      if (!fired && isRead && ids.length > 0) {
        fired = true;
        const mine = await db.query(
          `select id from jobs
            where id = any($1::int[])
              and xmax::text = coalesce(pg_current_xact_id_if_assigned()::text, '-')`,
          [ids],
        );
        const lockedByMe = new Set(mine.rows.map((r) => r.id));
        const free = ids.filter((id) => !lockedByMe.has(id));
        if (free.length > 0) {
          await db.query(
            `update jobs set status = 'running', attempts = attempts + 1, locked_until = $2
              where id = any($1::int[])`,
            [free, new Date(now.getTime() + 10 * MIN)],
          );
          stolen.push(...free);
        }
      }
      return res;
    },
  };
  return { conn, stolen };
}

async function job(id) {
  const r = await q('select id, status, attempts, run_at, locked_until, last_error from jobs where id = $1', [id]);
  return r[0];
}

async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}

const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

describe('claimJobs', () => {
  it('claims due jobs and expired leases from one queue, oldest run_at first', async () => {
    const { conn } = spyConn();
    const claimed = await solution.claimJobs(conn, { queue: 'emails', limit: 10, now: NOON, leaseMs: 5 * MIN });
    expect(claimed).toStrictEqual([
      { id: 6, payload: { to: 'eve' }, attempts: 2 },
      { id: 1, payload: { to: 'ada' }, attempts: 1 },
      { id: 2, payload: { to: 'bob' }, attempts: 1 },
    ]);
  });

  it('marks claimed jobs running with a lease of now + leaseMs', async () => {
    await solution.claimJobs(spyConn().conn, { queue: 'emails', limit: 10, now: NOON, leaseMs: 5 * MIN });
    for (const id of [1, 2, 6]) {
      const row = await job(id);
      expect(row.status).toBe('running');
      expect(row.locked_until.getTime()).toBe(NOON.getTime() + 5 * MIN);
    }
  });

  it('leaves alone future, done, dead, other-queue and live-lease jobs', async () => {
    await solution.claimJobs(spyConn().conn, { queue: 'emails', limit: 10, now: NOON, leaseMs: MIN });
    expect(await job(3)).toMatchObject({ status: 'queued', attempts: 0 });
    expect(await job(4)).toMatchObject({ status: 'queued', attempts: 0 });
    expect(await job(5)).toMatchObject({ status: 'done', attempts: 1 });
    expect(await job(7)).toMatchObject({ status: 'running', attempts: 1 });
    expect((await job(7)).locked_until.getTime()).toBe(at('2024-05-01T12:05:00Z').getTime());
    expect(await job(8)).toMatchObject({ status: 'dead', attempts: 5 });
  });

  it('respects limit, and the next claim gets the next jobs, never the same ones', async () => {
    const { conn } = spyConn();
    const first = await solution.claimJobs(conn, { queue: 'emails', limit: 2, now: NOON, leaseMs: MIN });
    const second = await solution.claimJobs(conn, { queue: 'emails', limit: 2, now: NOON, leaseMs: MIN });
    const third = await solution.claimJobs(conn, { queue: 'emails', limit: 2, now: NOON, leaseMs: MIN });
    expect(first.map((j) => j.id)).toEqual([6, 1]);
    expect(second.map((j) => j.id)).toEqual([2]);
    expect(third).toEqual([]);
  });

  it('treats run_at and locked_until equal to now as due', async () => {
    const claimed = await solution.claimJobs(spyConn().conn,
      { queue: 'emails', limit: 10, now: at('2024-05-01T12:10:00Z'), leaseMs: MIN });
    expect(claimed.map((j) => j.id)).toEqual([7, 6, 1, 2, 3]);
  });

  it('reclaims a job whose lease expired, bumping attempts again', async () => {
    const { conn } = spyConn();
    await solution.claimJobs(conn, { queue: 'reports', limit: 1, now: NOON, leaseMs: MIN });
    const tooSoon = await solution.claimJobs(conn, { queue: 'reports', limit: 1, now: at('2024-05-01T12:00:30Z'), leaseMs: MIN });
    expect(tooSoon).toEqual([]);
    const later = await solution.claimJobs(conn, { queue: 'reports', limit: 1, now: at('2024-05-01T12:02:00Z'), leaseMs: MIN });
    expect(later).toStrictEqual([{ id: 4, payload: { month: '04' }, attempts: 2 }]);
  });

  it('never hands a job to two workers when another claims between your statements', async () => {
    const { conn, stolen } = withRivalWorker(NOON);
    const claimed = await solution.claimJobs(conn, { queue: 'emails', limit: 3, now: NOON, leaseMs: MIN });
    const overlap = claimed.filter((j) => stolen.includes(j.id));
    assert(overlap.length === 0,
      `jobs ${overlap.map((j) => j.id).join(', ')} were claimed by another worker after your read, and you claimed them too`);
    for (const id of [1, 2, 6]) {
      const row = await job(id);
      const expected = id === 6 ? 2 : 1;
      assert(row.attempts === expected, `job ${id} was claimed twice (attempts ${row.attempts})`);
    }
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('uses FOR UPDATE SKIP LOCKED so parallel workers do not queue behind each other', async () => {
    const { conn, calls } = spyConn();
    await solution.claimJobs(conn, { queue: 'emails', limit: 2, now: NOON, leaseMs: MIN });
    assert(calls.map(stripComments).some((t) => /for\s+update\s+skip\s+locked/i.test(t)),
      'no statement locked the rows it claims with FOR UPDATE SKIP LOCKED');
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('rejects bad input with a RangeError before any query', async () => {
    const base = { queue: 'emails', limit: 2, now: NOON, leaseMs: MIN };
    for (const patch of [{ queue: '' }, { limit: 0 }, { limit: 1.5 }, { limit: '2' }, { now: '2024-05-01' },
      { now: new Date('nope') }, { leaseMs: 0 }, { leaseMs: -5 }]) {
      const { conn, calls } = spyConn();
      const err = await rejectionOf(() => solution.claimJobs(conn, { ...base, ...patch }));
      assert(err instanceof RangeError, `${JSON.stringify(patch)}: expected a RangeError, got ${err && err.name}`);
      expect(calls).toEqual([]);
    }
  });
});

describe('completeJob', () => {
  it('marks the job done and clears the lease', async () => {
    const { conn } = spyConn();
    const [first] = await solution.claimJobs(conn, { queue: 'emails', limit: 1, now: NOON, leaseMs: MIN });
    expect(await solution.completeJob(conn, { id: first.id, attempts: first.attempts })).toBe(true);
    const row = await job(first.id);
    expect(row.status).toBe('done');
    expect(row.locked_until).toBeNull();
  });

  it('refuses (false) when the lease expired and another worker reclaimed the job', async () => {
    const { conn } = spyConn();
    const [mine] = await solution.claimJobs(conn, { queue: 'reports', limit: 1, now: NOON, leaseMs: MIN });
    const [theirs] = await solution.claimJobs(conn, { queue: 'reports', limit: 1, now: at('2024-05-01T12:05:00Z'), leaseMs: MIN });
    expect(theirs.id).toBe(mine.id);
    expect(await solution.completeJob(conn, { id: mine.id, attempts: mine.attempts })).toBe(false);
    expect(await job(mine.id)).toMatchObject({ status: 'running', attempts: 2 });
    expect(await solution.completeJob(conn, { id: theirs.id, attempts: theirs.attempts })).toBe(true);
  });

  it('refuses (false) a job that is not running', async () => {
    expect(await solution.completeJob(spyConn().conn, { id: 5, attempts: 1 })).toBe(false);
    expect(await solution.completeJob(spyConn().conn, { id: 1, attempts: 0 })).toBe(false);
    expect(await job(1)).toMatchObject({ status: 'queued' });
  });
});

describe('failJob', () => {
  it('requeues with exponential backoff: now + backoffMs * 2^(attempts - 1)', async () => {
    const { conn } = spyConn();
    const opts = { error: 'SMTP 451', maxAttempts: 5, backoffMs: 30_000 };
    const [eve] = await solution.claimJobs(conn, { queue: 'emails', limit: 1, now: NOON, leaseMs: MIN });
    expect(eve).toMatchObject({ id: 6, attempts: 2 });
    expect(await solution.failJob(conn, { id: 6, attempts: 2, now: NOON, ...opts })).toBe('retry');
    const row = await job(6);
    expect(row).toMatchObject({ status: 'queued', attempts: 2, locked_until: null, last_error: 'SMTP 451' });
    expect(row.run_at.getTime()).toBe(NOON.getTime() + 60_000);

    const [ada] = await solution.claimJobs(conn, { queue: 'emails', limit: 1, now: NOON, leaseMs: MIN });
    expect(ada).toMatchObject({ id: 1, attempts: 1 });
    expect(await solution.failJob(conn, { id: 1, attempts: 1, now: NOON, ...opts })).toBe('retry');
    expect((await job(1)).run_at.getTime()).toBe(NOON.getTime() + 30_000);
  });

  it('a failed job is claimable again once its backoff has passed', async () => {
    const { conn } = spyConn();
    await solution.claimJobs(conn, { queue: 'reports', limit: 1, now: NOON, leaseMs: MIN });
    await solution.failJob(conn, { id: 4, attempts: 1, error: 'timeout', now: NOON, maxAttempts: 3, backoffMs: 10_000 });
    expect(await solution.claimJobs(conn, { queue: 'reports', limit: 1, now: at('2024-05-01T12:00:09Z'), leaseMs: MIN })).toEqual([]);
    const again = await solution.claimJobs(conn, { queue: 'reports', limit: 1, now: at('2024-05-01T12:00:10Z'), leaseMs: MIN });
    expect(again).toStrictEqual([{ id: 4, payload: { month: '04' }, attempts: 2 }]);
  });

  it('marks the job dead when this was its last allowed attempt', async () => {
    const { conn } = spyConn();
    await solution.claimJobs(conn, { queue: 'emails', limit: 1, now: NOON, leaseMs: MIN });
    expect(await solution.failJob(conn, { id: 6, attempts: 2, error: 'bounced', now: NOON, maxAttempts: 2, backoffMs: 1000 })).toBe('dead');
    expect(await job(6)).toMatchObject({ status: 'dead', locked_until: null, last_error: 'bounced' });
    const later = await solution.claimJobs(conn, { queue: 'emails', limit: 10, now: at('2024-06-01T00:00:00Z'), leaseMs: MIN });
    expect(later.map((j) => j.id)).not.toContain(6);
  });

  it('changes nothing and resolves to null when the caller no longer owns the job', async () => {
    const { conn } = spyConn();
    const [mine] = await solution.claimJobs(conn, { queue: 'reports', limit: 1, now: NOON, leaseMs: MIN });
    await solution.claimJobs(conn, { queue: 'reports', limit: 1, now: at('2024-05-01T12:05:00Z'), leaseMs: MIN });
    const out = await solution.failJob(conn, { id: mine.id, attempts: mine.attempts, error: 'late', now: at('2024-05-01T12:06:00Z'), maxAttempts: 5, backoffMs: 1000 });
    expect(out).toBeNull();
    expect(await job(mine.id)).toMatchObject({ status: 'running', attempts: 2, last_error: null });
  });
});

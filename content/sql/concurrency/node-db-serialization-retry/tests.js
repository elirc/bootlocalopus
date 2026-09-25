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
    delete from on_call;
    delete from doctors where id > 3;
    insert into on_call (shift, doctor_id) values ('2024-03-01', 1), ('2024-03-01', 2), ('2024-03-02', 3);
  `);
}
beforeEach(reset);
afterEach(async () => { if (await inTransaction()) await db.query('rollback'); });

const pgError = (code, message) => Object.assign(new Error(message), { code, severity: 'ERROR' });
const serializationFailure = () => pgError('40001', 'could not serialize access due to read/write dependencies among transactions');
const deadlock = () => pgError('40P01', 'deadlock detected');

const isCommit = (t) => /^\s*(commit|end)\b/i.test(t);
const isRollback = (t) => /^\s*rollback\b/i.test(t) && !/to\s+savepoint/i.test(t);
const isBegin = (t) => /^\s*(begin|start\s+transaction)\b/i.test(t);

/** A connection with only `query`. `inject(text, calls)` runs first and may throw instead of forwarding. */
function spyConn(inject) {
  const calls = [];
  const conn = {
    async query(text, params) {
      text = String(text);
      calls.push(text);
      if (inject) await inject(text, calls);
      return db.query(text, params);
    },
  };
  return { conn, calls };
}

/** A sleep that records the delays and returns at once. */
function fakeSleep() {
  const delays = [];
  const sleep = async (ms) => { delays.push(ms); };
  return { sleep, delays };
}

async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}

async function doctorsNamed(name) {
  const r = await q('select count(*)::int as c from doctors where name = $1', [name]);
  return r[0].c;
}

async function onCall(shift) {
  const r = await q('select doctor_id from on_call where shift = $1 order by doctor_id', [shift]);
  return r.map((x) => x.doctor_id);
}

describe('withSerializableRetry', () => {
  it('runs work in a SERIALIZABLE transaction and resolves to its result', async () => {
    const { conn, calls } = spyConn();
    const { sleep, delays } = fakeSleep();
    let isolation = null;
    const result = await solution.withSerializableRetry(conn, async (c) => {
      const r = await c.query('show transaction_isolation');
      isolation = r.rows[0].transaction_isolation;
      await c.query("insert into doctors (name) values ('Dan')");
      return { done: true };
    }, { sleep });
    expect(isolation).toBe('serializable');
    expect(result).toStrictEqual({ done: true });
    expect(await doctorsNamed('Dan')).toBe(1);
    expect(calls.filter(isBegin)).toHaveLength(1);
    expect(calls.filter(isCommit)).toHaveLength(1);
    expect(delays).toEqual([]);
    assert(!(await inTransaction()), 'the transaction is still open after it resolved');
  });

  it('retries after a 40001 from inside work, and the failed attempt leaves nothing behind', async () => {
    const { conn, calls } = spyConn();
    const { sleep, delays } = fakeSleep();
    let attempts = 0;
    const result = await solution.withSerializableRetry(conn, async (c) => {
      attempts += 1;
      await c.query("insert into doctors (name) values ('Dan')");
      if (attempts === 1) throw serializationFailure();
      return attempts;
    }, { sleep });
    expect(result).toBe(2);
    expect(await doctorsNamed('Dan')).toBe(1);
    expect(delays).toEqual([10]);
    assert(calls.some(isRollback), 'expected a ROLLBACK after the failed attempt');
    expect(calls.filter(isBegin)).toHaveLength(2);
  });

  it('retries when COMMIT itself reports the serialization failure', async () => {
    let commits = 0;
    const { conn } = spyConn((text) => {
      if (isCommit(text)) {
        commits += 1;
        if (commits === 1) throw serializationFailure();
      }
    });
    const { sleep, delays } = fakeSleep();
    let attempts = 0;
    const result = await solution.withSerializableRetry(conn, async (c) => {
      attempts += 1;
      await c.query("insert into doctors (name) values ('Eve')");
      return 'saved';
    }, { sleep });
    expect(result).toBe('saved');
    expect(attempts).toBe(2);
    expect(await doctorsNamed('Eve')).toBe(1);
    expect(delays).toEqual([10]);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('also retries a deadlock (40P01)', async () => {
    const { sleep, delays } = fakeSleep();
    let attempts = 0;
    const result = await solution.withSerializableRetry(spyConn().conn, async () => {
      attempts += 1;
      if (attempts < 3) throw deadlock();
      return 'ok';
    }, { sleep });
    expect(result).toBe('ok');
    expect(delays).toEqual([10, 20]);
  });

  it('gives up after maxAttempts and rethrows the last error', async () => {
    const { sleep, delays } = fakeSleep();
    const thrown = [];
    const err = await rejectionOf(() => solution.withSerializableRetry(spyConn().conn, async () => {
      const e = serializationFailure();
      thrown.push(e);
      throw e;
    }, { sleep }));
    expect(thrown).toHaveLength(5);
    expect(err).toBe(thrown[4]);
    expect(delays).toEqual([10, 20, 40, 80]);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('honours maxAttempts and baseDelayMs', async () => {
    const { sleep, delays } = fakeSleep();
    let attempts = 0;
    const err = await rejectionOf(() => solution.withSerializableRetry(spyConn().conn, async () => {
      attempts += 1;
      throw serializationFailure();
    }, { sleep, maxAttempts: 3, baseDelayMs: 100 }));
    expect(err.code).toBe('40001');
    expect(attempts).toBe(3);
    expect(delays).toEqual([100, 200]);
  });

  it('does not retry other errors: one attempt, no sleep, same error, rolled back', async () => {
    for (const make of [() => new Error('bug in work'), () => pgError('23505', 'duplicate key value violates unique constraint')]) {
      const { conn, calls } = spyConn();
      const { sleep, delays } = fakeSleep();
      let attempts = 0;
      const original = make();
      const err = await rejectionOf(() => solution.withSerializableRetry(conn, async (c) => {
        attempts += 1;
        await c.query("insert into doctors (name) values ('Fay')");
        throw original;
      }, { sleep }));
      expect(err).toBe(original);
      expect(attempts).toBe(1);
      expect(delays).toEqual([]);
      assert(calls.some(isRollback), 'expected a ROLLBACK');
      expect(await doctorsNamed('Fay')).toBe(0);
      assert(!(await inTransaction()), 'the connection was left inside a transaction');
    }
  });
});

describe('goOffCall', () => {
  it('takes a doctor off call when someone else stays on', async () => {
    expect(await solution.goOffCall(spyConn().conn, '2024-03-01', 1)).toBe(1);
    expect(await onCall('2024-03-01')).toEqual([2]);
  });

  it('refuses to take the last doctor off call', async () => {
    const err = await rejectionOf(() => solution.goOffCall(spyConn().conn, '2024-03-02', 3));
    expect(err).toBeInstanceOf(solution.LastDoctorError);
    expect(await onCall('2024-03-02')).toEqual([3]);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('changes nothing for a doctor who is not on call that shift', async () => {
    expect(await solution.goOffCall(spyConn().conn, '2024-03-02', 1)).toBe(1);
    expect(await onCall('2024-03-02')).toEqual([3]);
  });

  it('runs serializable, and survives a serialization failure on its delete', async () => {
    let deletes = 0;
    const levels = [];
    const { conn } = spyConn(async (text) => {
      if (/^\s*delete\b/i.test(text)) {
        deletes += 1;
        const r = await db.query('show transaction_isolation');
        levels.push(r.rows[0].transaction_isolation);
        if (deletes === 1) throw serializationFailure();
      }
    });
    expect(await solution.goOffCall(conn, '2024-03-01', 2)).toBe(1);
    expect(deletes).toBe(2);
    expect(levels).toEqual(['serializable', 'serializable']);
    expect(await onCall('2024-03-01')).toEqual([1]);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });
});

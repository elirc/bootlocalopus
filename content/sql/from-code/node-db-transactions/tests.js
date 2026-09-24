// node-db lessons share one database across tests, with no per-test
// transaction: every test starts from a reset, and a transaction the code
// under test leaves open is detected and rolled back.

const START = { acc_ada: 50000, acc_bob: 12000, acc_cy: 0 };
const TOTAL = 62000;

/** True when the connection is inside a transaction block (open or aborted). */
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
    delete from idempotency_keys;
    delete from transfers;
    update accounts set balance_cents = case id
      when 'acc_ada' then 50000 when 'acc_bob' then 12000 else 0 end;
  `);
}

beforeEach(reset);
afterEach(async () => {
  if (await inTransaction()) await db.query('rollback');
});

/** A connection exposing only `query`; records every call. `onQuery` runs before a call is forwarded and may throw. */
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

const isUpdate = (c) => /^\s*update\b/i.test(c.text);
const isWrite = (c) => /^\s*(update|insert|delete)\b/i.test(c.text);
const isBegin = (c) => /^\s*(begin|start\s+transaction)\b/i.test(c.text);
const isCommit = (c) => /^\s*(commit|end)\b/i.test(c.text);
const isRollback = (c) => /^\s*rollback\b/i.test(c.text) && !/to\s+savepoint/i.test(c.text);

async function balances() {
  const rows = await q('select id, balance_cents from accounts order by id');
  return Object.fromEntries(rows.map((r) => [r.id, r.balance_cents]));
}
async function count(table) {
  const rows = await q(`select count(*)::int as c from ${table}`);
  return rows[0].c;
}
async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected transfer() to reject, but it resolved');
}
async function expectClosedAndUntouched(calls) {
  assert(!(await inTransaction()),
    'the connection was left inside a transaction: every way out of transfer() must COMMIT or ROLLBACK');
  expect(await balances()).toEqual(START);
  expect(await count('transfers')).toBe(0);
  expect(await count('idempotency_keys')).toBe(0);
  if (calls) assert(calls.some(isRollback), 'expected a ROLLBACK to be sent after the failure');
}

describe('a successful transfer', () => {
  it('moves the money and returns { transferId, fromBalanceCents, toBalanceCents }', async () => {
    const { conn } = spyConn();
    const result = await solution.transfer(conn, { from: 'acc_ada', to: 'acc_bob', cents: 2345, idempotencyKey: 'k-1' });
    const rows = await q('select id, from_id, to_id, cents from transfers');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from_id: 'acc_ada', to_id: 'acc_bob', cents: 2345 });
    expect(result).toStrictEqual({ transferId: rows[0].id, fromBalanceCents: 47655, toBalanceCents: 14345 });
    expect(await balances()).toEqual({ acc_ada: 47655, acc_bob: 14345, acc_cy: 0 });
  });

  it('does all of its writes inside one BEGIN … COMMIT', async () => {
    const { conn, calls } = spyConn();
    await solution.transfer(conn, { from: 'acc_ada', to: 'acc_bob', cents: 100, idempotencyKey: 'k-2' });
    expect(calls.filter(isBegin)).toHaveLength(1);
    expect(calls.filter(isCommit)).toHaveLength(1);
    const begin = calls.findIndex(isBegin);
    const commit = calls.findIndex(isCommit);
    calls.forEach((c, i) => {
      if (isWrite(c)) assert(i > begin && i < commit, `this write ran outside the transaction:\n${c.text}`);
    });
    assert(!(await inTransaction()), 'the transaction is still open after transfer() resolved');
  });

  it('sends every value as a parameter, never as SQL text', async () => {
    const { conn, calls } = spyConn();
    await solution.transfer(conn, { from: 'acc_ada', to: 'acc_bob', cents: 2345, idempotencyKey: 'k-zq81' });
    for (const { text } of calls) {
      for (const value of ['acc_ada', 'acc_bob', '2345', 'k-zq81']) {
        assert(!text.includes(value), `the SQL text contains ${value}:\n${text}`);
      }
    }
    const params = calls.flatMap((c) => c.params);
    expect(params).toContain('acc_ada');
    expect(params).toContain('acc_bob');
    expect(params).toContain('k-zq81');
    expect(params.some((p) => p === 2345 || p === '2345')).toBe(true);
  });

  it('stores the key with its request and response', async () => {
    const { conn } = spyConn();
    const result = await solution.transfer(conn, { from: 'acc_bob', to: 'acc_cy', cents: 700, idempotencyKey: 'k-3' });
    const rows = await q('select request, response from idempotency_keys where key = $1', ['k-3']);
    expect(rows).toHaveLength(1);
    expect(rows[0].request).toEqual({ from: 'acc_bob', to: 'acc_cy', cents: 700 });
    expect(rows[0].response).toEqual(result);
  });
});

describe('failures leave nothing behind', () => {
  it('rejects an overdraft with InsufficientFundsError and rolls back', async () => {
    const { conn, calls } = spyConn();
    const err = await rejectionOf(() =>
      solution.transfer(conn, { from: 'acc_bob', to: 'acc_cy', cents: 12001, idempotencyKey: 'k-over' }));
    expect(err).toBeInstanceOf(solution.InsufficientFundsError);
    expect(err.accountId).toBe('acc_bob');
    await expectClosedAndUntouched(calls);
  });

  it('decides "enough money?" in the UPDATE itself, not from an earlier read', async () => {
    // Simulates another request spending Bob's money after any read you make
    // and before your debit runs. Only a conditional UPDATE sees it.
    let drained = false;
    const { conn } = spyConn(async (call) => {
      if (!drained && isUpdate(call) && /accounts/i.test(call.text)) {
        drained = true;
        await db.query("update accounts set balance_cents = 100 where id = 'acc_bob'");
      }
    });
    const err = await rejectionOf(() =>
      solution.transfer(conn, { from: 'acc_bob', to: 'acc_cy', cents: 5000, idempotencyKey: 'k-race' }));
    assert(err instanceof solution.InsufficientFundsError,
      `expected InsufficientFundsError, got ${err && err.name}: ${err && err.message}`);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
    expect(await count('transfers')).toBe(0);
  });

  it('rejects an unknown source account with AccountNotFoundError', async () => {
    const { conn, calls } = spyConn();
    const err = await rejectionOf(() =>
      solution.transfer(conn, { from: 'acc_nope', to: 'acc_bob', cents: 100, idempotencyKey: 'k-nf1' }));
    expect(err).toBeInstanceOf(solution.AccountNotFoundError);
    expect(err.accountId).toBe('acc_nope');
    await expectClosedAndUntouched(calls);
  });

  it('rejects an unknown destination with AccountNotFoundError and undoes the debit', async () => {
    const { conn, calls } = spyConn();
    const err = await rejectionOf(() =>
      solution.transfer(conn, { from: 'acc_ada', to: 'acc_nope', cents: 1000, idempotencyKey: 'k-nf2' }));
    expect(err).toBeInstanceOf(solution.AccountNotFoundError);
    expect(err.accountId).toBe('acc_nope');
    await expectClosedAndUntouched(calls);
  });

  it('rolls back the debit when anything fails after it (the 2nd UPDATE throws)', async () => {
    const injected = new Error('injected: connection reset during the credit');
    const { conn, calls } = spyConn((call, all) => {
      if (isUpdate(call) && all.filter(isUpdate).length === 2) throw injected;
    });
    const err = await rejectionOf(() =>
      solution.transfer(conn, { from: 'acc_ada', to: 'acc_bob', cents: 1500, idempotencyKey: 'k-crash' }));
    assert(err === injected, `expected the original error to propagate unchanged, got ${err && err.name}: ${err && err.message}`);
    await expectClosedAndUntouched(calls);
  });

  it('leaves the connection usable after a failure', async () => {
    const boom = spyConn((call, all) => {
      if (isUpdate(call) && all.filter(isUpdate).length === 2) throw new Error('injected');
    });
    await rejectionOf(() =>
      solution.transfer(boom.conn, { from: 'acc_ada', to: 'acc_bob', cents: 1500, idempotencyKey: 'k-a' }));
    const { conn } = spyConn();
    const result = await solution.transfer(conn, { from: 'acc_ada', to: 'acc_bob', cents: 1500, idempotencyKey: 'k-a' });
    expect(result.fromBalanceCents).toBe(48500);
    expect(await balances()).toEqual({ acc_ada: 48500, acc_bob: 13500, acc_cy: 0 });
    assert(!(await inTransaction()), 'the transaction is still open after transfer() resolved');
  });

  it('rejects invalid input with a RangeError before any query', async () => {
    const base = { from: 'acc_ada', to: 'acc_bob', cents: 100, idempotencyKey: 'k-v' };
    const bad = [
      { cents: 0 }, { cents: -100 }, { cents: 10.5 }, { cents: '100' }, { cents: Number.NaN },
      { cents: Number.POSITIVE_INFINITY }, { cents: 2 ** 53 },
      { to: 'acc_ada' }, { from: '' }, { to: undefined },
      { idempotencyKey: '' }, { idempotencyKey: undefined },
    ];
    for (const patch of bad) {
      const { conn, calls } = spyConn();
      const err = await rejectionOf(() => solution.transfer(conn, { ...base, ...patch }));
      assert(err instanceof RangeError, `${JSON.stringify(patch)}: expected a RangeError, got ${err && err.name}: ${err && err.message}`);
      assert(calls.length === 0, `${JSON.stringify(patch)}: invalid input reached the database (${calls[0] && calls[0].text})`);
    }
    expect(await balances()).toEqual(START);
  });
});

describe('idempotency', () => {
  it('returns the original result for a replayed key, and moves nothing', async () => {
    const first = await solution.transfer(spyConn().conn, { from: 'acc_ada', to: 'acc_bob', cents: 1000, idempotencyKey: 'k-a' });
    await solution.transfer(spyConn().conn, { from: 'acc_ada', to: 'acc_cy', cents: 500, idempotencyKey: 'k-b' });
    const before = await balances();

    const replay = await solution.transfer(spyConn().conn, { from: 'acc_ada', to: 'acc_bob', cents: 1000, idempotencyKey: 'k-a' });
    const again = await solution.transfer(spyConn().conn, { from: 'acc_ada', to: 'acc_bob', cents: 1000, idempotencyKey: 'k-a' });

    // The stored result, not a fresh one: Ada's balance was 49000 after that transfer.
    expect(replay).toStrictEqual(first);
    expect(again).toStrictEqual(first);
    expect(first.fromBalanceCents).toBe(49000);
    expect(await balances()).toEqual(before);
    expect(await count('transfers')).toBe(2);
    assert(!(await inTransaction()), 'the transaction is still open after a replay');
  });

  it('rejects a key reused for a different transfer, and moves nothing', async () => {
    await solution.transfer(spyConn().conn, { from: 'acc_ada', to: 'acc_bob', cents: 1000, idempotencyKey: 'k-a' });
    const before = await balances();
    for (const patch of [{ cents: 999 }, { to: 'acc_cy' }, { from: 'acc_bob', to: 'acc_ada' }]) {
      const err = await rejectionOf(() => solution.transfer(spyConn().conn,
        { from: 'acc_ada', to: 'acc_bob', cents: 1000, idempotencyKey: 'k-a', ...patch }));
      expect(err).toBeInstanceOf(solution.IdempotencyKeyReusedError);
      expect(err.key).toBe('k-a');
    }
    expect(await balances()).toEqual(before);
    expect(await count('transfers')).toBe(1);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('does not burn the key of a transfer that failed', async () => {
    const err = await rejectionOf(() => solution.transfer(spyConn().conn,
      { from: 'acc_bob', to: 'acc_cy', cents: 20000, idempotencyKey: 'k-retry' }));
    expect(err).toBeInstanceOf(solution.InsufficientFundsError);
    await q("update accounts set balance_cents = 30000 where id = 'acc_bob'");
    const ok = await solution.transfer(spyConn().conn, { from: 'acc_bob', to: 'acc_cy', cents: 20000, idempotencyKey: 'k-retry' });
    expect(ok.fromBalanceCents).toBe(10000);
    expect(ok.toBalanceCents).toBe(20000);
    expect(await count('idempotency_keys')).toBe(1);
  });
});

describe('conservation', () => {
  it('never creates or destroys money across a mix of successes and failures', async () => {
    const crashOnCredit = () => spyConn((call, all) => {
      if (isUpdate(call) && all.filter(isUpdate).length === 2) throw new Error('injected');
    }).conn;
    const plain = () => spyConn().conn;
    const attempts = [
      [plain, { from: 'acc_ada', to: 'acc_bob', cents: 7000, idempotencyKey: 'm1' }],
      [plain, { from: 'acc_bob', to: 'acc_cy', cents: 50000, idempotencyKey: 'm2' }],
      [crashOnCredit, { from: 'acc_ada', to: 'acc_cy', cents: 3000, idempotencyKey: 'm3' }],
      [plain, { from: 'acc_cy', to: 'acc_nope', cents: 1, idempotencyKey: 'm4' }],
      [plain, { from: 'acc_bob', to: 'acc_cy', cents: 19000, idempotencyKey: 'm5' }],
      [plain, { from: 'acc_ada', to: 'acc_bob', cents: 7000, idempotencyKey: 'm1' }],
      [plain, { from: 'acc_cy', to: 'acc_ada', cents: 4000, idempotencyKey: 'm6' }],
    ];
    let succeeded = 0;
    for (const [make, input] of attempts) {
      try {
        await solution.transfer(make(), input);
        succeeded += 1;
      } catch { /* the failures are judged elsewhere; here only the totals matter */ }
      const sum = await q('select sum(balance_cents)::int as s from accounts');
      assert(sum[0].s === TOTAL, `after ${JSON.stringify(input)} the accounts hold ${sum[0].s} cents, not ${TOTAL}`);
    }
    expect(await balances()).toEqual({ acc_ada: 47000, acc_bob: 0, acc_cy: 15000 });
    expect(succeeded).toBe(4); // m1, m5, the m1 replay, m6
    expect(await count('transfers')).toBe(3);
  });
});

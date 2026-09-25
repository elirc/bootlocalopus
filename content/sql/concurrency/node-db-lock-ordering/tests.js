// node-db: one shared database; every test starts from a reset.
const START = [0, 5000, 1200, 300, 0, 0];
const TOTAL = START.reduce((a, b) => a + b, 0);

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
    truncate payment_lines, payments restart identity;
    update wallets set balance_cents = (array[${START.join(',')}])[id];
  `);
}
beforeEach(reset);
afterEach(async () => { if (await inTransaction()) await db.query('rollback'); });

const stripComments = (sql) => sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const isRollback = (t) => /^\s*rollback\b/i.test(t) && !/to\s+savepoint/i.test(t);

/** Wallet ids the open transaction has locked or updated; null when the transaction is aborted. */
async function walletsLockedByMe() {
  try {
    const r = await db.query(
      `select w.id from wallets w, (select pg_current_xact_id_if_assigned()::text as x) t
        where t.x is not null and (w.xmax::text = t.x or w.xmin::text = t.x) order by w.id`,
    );
    return r.rows.map((row) => row.id);
  } catch {
    return null;
  }
}

/**
 * A connection with only `query` that watches lock order. After every
 * statement it records which wallets became locked, and flags a statement
 * that locks a wallet with a lower id than one already held, or locks
 * several at once without an ORDER BY. `inject(text, n)` may throw first.
 */
function tracked(inject) {
  const calls = [];
  const violations = [];
  let held = [];
  let n = 0;
  const conn = {
    async query(text, params) {
      text = String(text);
      n += 1;
      calls.push(text);
      if (inject) await inject(text, n);
      const result = await db.query(text, params);
      const now = await walletsLockedByMe();
      if (now !== null) {
        const fresh = now.filter((id) => !held.includes(id));
        if (fresh.length > 0) {
          const maxHeld = held.length ? Math.max(...held) : -Infinity;
          if (Math.min(...fresh) < maxHeld) {
            violations.push(`locked wallet ${Math.min(...fresh)} while already holding wallet ${maxHeld}:\n${text}`);
          }
          if (fresh.length > 1 && !/\border\s+by\b/i.test(stripComments(text))) {
            violations.push(`locked wallets ${fresh.join(', ')} in one statement with no ORDER BY:\n${text}`);
          }
        }
        held = now;
      }
      return result;
    },
  };
  return { conn, calls, violations };
}

async function balances() {
  const rows = await q('select id, balance_cents from wallets order by id');
  return rows.map((r) => r.balance_cents);
}
async function count(table) {
  const r = await q(`select count(*)::int as c from ${table}`);
  return r[0].c;
}
async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected postPayment() to reject, but it resolved');
}
async function expectUntouched(calls) {
  assert(!(await inTransaction()), 'the connection was left inside a transaction');
  expect(await balances()).toEqual(START);
  expect(await count('payments')).toBe(0);
  expect(await count('payment_lines')).toBe(0);
  if (calls) assert(calls.some(isRollback), 'expected a ROLLBACK after the failure');
}

const ride = { memo: 'ride 1', lines: [{ walletId: 3, amountCents: 800 }, { walletId: 2, amountCents: -1000 }, { walletId: 1, amountCents: 200 }] };

describe('posting a payment', () => {
  it('moves the money and returns { paymentId, balances } sorted by walletId', async () => {
    const result = await solution.postPayment(tracked().conn, ride);
    const payments = await q('select id, memo from payments');
    expect(payments).toHaveLength(1);
    expect(result).toStrictEqual({
      paymentId: payments[0].id,
      balances: [
        { walletId: 1, balanceCents: 200 },
        { walletId: 2, balanceCents: 4000 },
        { walletId: 3, balanceCents: 2000 },
      ],
    });
    expect(await balances()).toEqual([200, 4000, 2000, 300, 0, 0]);
  });

  it('records one payment_lines row per line', async () => {
    const { paymentId } = await solution.postPayment(tracked().conn, ride);
    const lines = await q('select payment_id, wallet_id, amount_cents from payment_lines order by wallet_id');
    expect(lines).toEqual([
      { payment_id: paymentId, wallet_id: 1, amount_cents: 200 },
      { payment_id: paymentId, wallet_id: 2, amount_cents: -1000 },
      { payment_id: paymentId, wallet_id: 3, amount_cents: 800 },
    ]);
  });
});

describe('lock order', () => {
  it('locks wallets in ascending id order when the lines arrive out of order', async () => {
    const t = tracked();
    await solution.postPayment(t.conn, ride);
    assert(t.violations.length === 0, t.violations.join('\n\n'));
  });

  it('keeps the order for every payment in a busy run', async () => {
    const payments = [
      { memo: 'refund', lines: [{ walletId: 3, amountCents: -500 }, { walletId: 2, amountCents: 500 }] },
      { memo: 'ride 2', lines: [{ walletId: 6, amountCents: 50 }, { walletId: 5, amountCents: 700 }, { walletId: 2, amountCents: -1000 }, { walletId: 1, amountCents: 250 }] },
      { memo: 'payout', lines: [{ walletId: 5, amountCents: -700 }, { walletId: 1, amountCents: 700 }] },
    ];
    for (const p of payments) {
      const t = tracked();
      await solution.postPayment(t.conn, p);
      assert(t.violations.length === 0, `${p.memo}:\n` + t.violations.join('\n\n'));
    }
    expect(await balances()).toEqual([950, 4500, 700, 300, 0, 50]);
  });

  it('keeps the order on the way to a failure too', async () => {
    const t = tracked();
    const err = await rejectionOf(() => solution.postPayment(t.conn,
      { memo: 'too much', lines: [{ walletId: 6, amountCents: 1000 }, { walletId: 4, amountCents: -1000 }] }));
    expect(err).toBeInstanceOf(solution.InsufficientFundsError);
    assert(t.violations.length === 0, t.violations.join('\n\n'));
  });
});

describe('failures change nothing', () => {
  it('refuses to take a wallet below zero with InsufficientFundsError', async () => {
    const t = tracked();
    const err = await rejectionOf(() => solution.postPayment(t.conn,
      { memo: 'cy rides', lines: [{ walletId: 5, amountCents: 800 }, { walletId: 4, amountCents: -1000 }, { walletId: 1, amountCents: 200 }] }));
    expect(err).toBeInstanceOf(solution.InsufficientFundsError);
    expect(err.walletId).toBe(4);
    await expectUntouched(t.calls);
  });

  it('refuses a missing wallet with WalletNotFoundError', async () => {
    const t = tracked();
    const err = await rejectionOf(() => solution.postPayment(t.conn,
      { memo: 'ghost', lines: [{ walletId: 9, amountCents: 100 }, { walletId: 2, amountCents: -100 }] }));
    expect(err).toBeInstanceOf(solution.WalletNotFoundError);
    expect(err.walletId).toBe(9);
    await expectUntouched(t.calls);
  });

  it('rolls back and rethrows the original error when a later statement fails', async () => {
    const injected = new Error('injected: connection reset');
    const t = tracked((text) => { if (/^\s*insert\s+into\s+payment_lines/i.test(text)) throw injected; });
    const err = await rejectionOf(() => solution.postPayment(t.conn, ride));
    expect(err).toBe(injected);
    await expectUntouched(t.calls);
  });

  it('rejects invalid payments with a RangeError before any query', async () => {
    const two = (a, b) => [{ walletId: 2, amountCents: a }, { walletId: 3, amountCents: b }];
    const bad = [
      { memo: '', lines: two(-1, 1) },
      { memo: 'x', lines: [{ walletId: 2, amountCents: 0 }] },
      { memo: 'x', lines: [] },
      { memo: 'x', lines: 'nope' },
      { memo: 'x', lines: two(-100, 99) },
      { memo: 'x', lines: two(0, 0) },
      { memo: 'x', lines: two(-1.5, 1.5) },
      { memo: 'x', lines: two('-1', '1') },
      { memo: 'x', lines: [{ walletId: 2, amountCents: -1 }, { walletId: 2, amountCents: 1 }] },
      { memo: 'x', lines: [{ walletId: 0, amountCents: -1 }, { walletId: 3, amountCents: 1 }] },
      { memo: 'x', lines: [{ walletId: '2', amountCents: -1 }, { walletId: 3, amountCents: 1 }] },
    ];
    for (const input of bad) {
      const t = tracked();
      const err = await rejectionOf(() => solution.postPayment(t.conn, input));
      assert(err instanceof RangeError, `${JSON.stringify(input)}: expected RangeError, got ${err && err.name}: ${err && err.message}`);
      assert(t.calls.length === 0, `${JSON.stringify(input)}: invalid input reached the database`);
    }
  });
});

describe('conservation', () => {
  it('never creates or destroys money across successes and failures', async () => {
    const attempts = [
      ride,
      { memo: 'b', lines: [{ walletId: 4, amountCents: -301 }, { walletId: 1, amountCents: 301 }] },
      { memo: 'c', lines: [{ walletId: 4, amountCents: -300 }, { walletId: 5, amountCents: 300 }] },
      { memo: 'd', lines: [{ walletId: 7, amountCents: 1 }, { walletId: 2, amountCents: -1 }] },
      { memo: 'e', lines: [{ walletId: 6, amountCents: 1 }, { walletId: 5, amountCents: -1 }] },
    ];
    let ok = 0;
    for (const input of attempts) {
      try { await solution.postPayment(tracked().conn, input); ok += 1; } catch { /* judged elsewhere */ }
      const sum = (await balances()).reduce((a, b) => a + b, 0);
      assert(sum === TOTAL, `after ${input.memo} the wallets hold ${sum}, not ${TOTAL}`);
    }
    expect(ok).toBe(3);
    expect(await balances()).toEqual([200, 4000, 2000, 0, 299, 1]);
    expect(await count('payments')).toBe(3);
  });
});

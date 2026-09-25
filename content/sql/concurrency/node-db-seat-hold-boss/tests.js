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
    truncate seats, orders restart identity;
    insert into orders (event_id, buyer, hold_token) values (1, 'zed', 'tok-zed');
    insert into seats (event_id, label, held_by, held_until, order_id) values
      (1, 'A1', null, null, null),
      (1, 'A2', null, null, null),
      (1, 'A3', null, null, null),
      (1, 'A4', 'tok-live', '2024-05-01T12:10:00Z', null),
      (1, 'A5', null, null, 1),
      (1, 'A6', 'tok-old', '2024-05-01T11:55:00Z', null),
      (2, 'B1', null, null, null),
      (2, 'B2', null, null, null);
  `);
}
beforeEach(reset);
afterEach(async () => { if (await inTransaction()) await db.query('rollback'); });

const NOON = new Date('2024-05-01T12:00:00Z');
const MIN = 60_000;
const later = (ms) => new Date(NOON.getTime() + ms);

const isBegin = (t) => /^\s*(begin|start\s+transaction)\b/i.test(t);
const isCommit = (t) => /^\s*(commit|end)\b/i.test(t);
const isRollback = (t) => /^\s*rollback\b/i.test(t) && !/to\s+savepoint/i.test(t);
const isWrite = (t) => /^\s*(update|insert|delete)\b/i.test(t);

/** A connection with only `query`. `before(text, calls)` runs before a statement is forwarded, and may throw. */
function spyConn(before) {
  const calls = [];
  const conn = {
    async query(text, params) {
      text = String(text);
      calls.push({ text, params: Array.isArray(params) ? [...params] : [] });
      if (before) await before(text, calls);
      return db.query(text, params);
    },
  };
  return { conn, calls, texts: () => calls.map((c) => c.text) };
}

/** Is seat `id` row-locked (or already written) by the transaction open on the connection? */
async function lockedByMe(id) {
  const r = await db.query(
    `select (s.xmax::text = t.x or s.xmin::text = t.x) as mine
       from seats s, (select pg_current_xact_id_if_assigned()::text as x) t
      where s.id = $1`,
    [id],
  );
  return r.rows.length > 0 && r.rows[0].mine === true;
}

async function seat(id) {
  const r = await q('select id, held_by, held_until, order_id from seats where id = $1', [id]);
  return r[0];
}
async function orderCount() {
  return (await q('select count(*)::int as n from orders'))[0].n;
}
async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}
async function closed() {
  assert(!(await inTransaction()), 'the connection was left inside a transaction');
}

describe('holdSeats', () => {
  it('holds free seats and resolves to { token, seatIds (ascending), expiresAt }', async () => {
    const out = await solution.holdSeats(spyConn().conn,
      { eventId: 1, seatIds: [3, 1], token: 'tok-a', now: NOON, ttlMs: 10 * MIN });
    expect(out.token).toBe('tok-a');
    expect(out.seatIds).toEqual([1, 3]);
    expect(out.expiresAt).toBeInstanceOf(Date);
    expect(out.expiresAt.getTime()).toBe(NOON.getTime() + 10 * MIN);
    for (const id of [1, 3]) {
      const s = await seat(id);
      expect(s.held_by).toBe('tok-a');
      expect(s.held_until.getTime()).toBe(NOON.getTime() + 10 * MIN);
    }
    expect((await seat(2)).held_by).toBeNull();
    await closed();
  });

  it('does it in one transaction with every value as a parameter', async () => {
    const spy = spyConn();
    await solution.holdSeats(spy.conn, { eventId: 1, seatIds: [1, 2], token: 'tok-zq71', now: NOON, ttlMs: MIN });
    const texts = spy.texts();
    const begin = texts.findIndex(isBegin);
    const commit = texts.findIndex(isCommit);
    assert(begin >= 0 && commit > begin, 'expected BEGIN … COMMIT around the hold');
    texts.forEach((t, i) => {
      if (isWrite(t)) assert(i > begin && i < commit, `this write ran outside the transaction:\n${t}`);
      assert(!t.includes('tok-zq71'), `the token is in the SQL text:\n${t}`);
    });
  });

  it('takes over an expired hold', async () => {
    const out = await solution.holdSeats(spyConn().conn, { eventId: 1, seatIds: [6], token: 'tok-a', now: NOON, ttlMs: MIN });
    expect(out.seatIds).toEqual([6]);
    expect((await seat(6)).held_by).toBe('tok-a');
  });

  it('treats a hold expiring exactly now as expired', async () => {
    await solution.holdSeats(spyConn().conn,
      { eventId: 1, seatIds: [4], token: 'tok-a', now: new Date('2024-05-01T12:10:00Z'), ttlMs: MIN });
    expect((await seat(4)).held_by).toBe('tok-a');
  });

  it('is all or nothing: a live hold or a sold seat fails the whole request with SeatUnavailableError', async () => {
    const spy = spyConn();
    const err = await rejectionOf(() => solution.holdSeats(spy.conn,
      { eventId: 1, seatIds: [5, 1, 4, 2], token: 'tok-a', now: NOON, ttlMs: MIN }));
    expect(err).toBeInstanceOf(solution.SeatUnavailableError);
    expect(err.seatIds).toEqual([4, 5]);
    expect((await seat(1)).held_by).toBeNull();
    expect((await seat(2)).held_by).toBeNull();
    expect((await seat(4)).held_by).toBe('tok-live');
    assert(spy.texts().some(isRollback), 'expected a ROLLBACK after the failure');
    await closed();
  });

  it('rejects seats that do not exist or belong to another event with SeatNotFoundError', async () => {
    const err = await rejectionOf(() => solution.holdSeats(spyConn().conn,
      { eventId: 1, seatIds: [999, 1, 7], token: 'tok-a', now: NOON, ttlMs: MIN }));
    expect(err).toBeInstanceOf(solution.SeatNotFoundError);
    expect(err.seatIds).toEqual([7, 999]);
    expect((await seat(1)).held_by).toBeNull();
    await closed();
  });

  it('lets the same token hold again: it extends the hold and may add seats', async () => {
    const { conn } = spyConn();
    await solution.holdSeats(conn, { eventId: 1, seatIds: [1, 2], token: 'tok-a', now: NOON, ttlMs: 5 * MIN });
    const again = await solution.holdSeats(conn, { eventId: 1, seatIds: [1, 2, 3], token: 'tok-a', now: later(3 * MIN), ttlMs: 5 * MIN });
    expect(again.seatIds).toEqual([1, 2, 3]);
    for (const id of [1, 2, 3]) expect((await seat(id)).held_until.getTime()).toBe(NOON.getTime() + 8 * MIN);
    const other = await rejectionOf(() => solution.holdSeats(conn,
      { eventId: 1, seatIds: [3], token: 'tok-b', now: later(4 * MIN), ttlMs: MIN }));
    expect(other).toBeInstanceOf(solution.SeatUnavailableError);
  });

  it('never overwrites a hold another customer made after your read', async () => {
    // A rival holds seat 2 just before your first UPDATE of seats — unless your
    // transaction already has seat 2 locked, in which case (like Postgres) the
    // rival has to wait for you.
    let stole = false;
    const { conn } = spyConn(async (text) => {
      if (!stole && /^\s*update\s+seats\b/i.test(text) && !(await lockedByMe(2))) {
        stole = true;
        await db.query("update seats set held_by = 'tok-rival', held_until = $1 where id = 2", [later(10 * MIN)]);
      }
    });
    let result;
    let error;
    try {
      result = await solution.holdSeats(conn, { eventId: 1, seatIds: [1, 2, 3], token: 'tok-a', now: NOON, ttlMs: MIN });
    } catch (e) {
      error = e;
    }
    if (stole) {
      assert(!result, 'the rival held seat 2 after your read, and your hold overwrote it: two customers now think they hold it');
      expect(error).toBeInstanceOf(solution.SeatUnavailableError);
      expect(error.seatIds).toEqual([2]);
      // (The rival shares your connection here, so your ROLLBACK also undid its hold.)
      expect((await seat(2)).held_by).not.toBe('tok-a');
      expect((await seat(1)).held_by).toBeNull();
    } else {
      assert(result, `your seats were locked, so the hold should succeed; got ${error && error.name}`);
      expect((await seat(2)).held_by).toBe('tok-a');
    }
    await closed();
  });

  it('rolls back and rethrows when a statement fails mid-hold', async () => {
    const injected = new Error('injected: connection reset');
    const { conn } = spyConn((text) => { if (/^\s*update\s+seats\b/i.test(text)) throw injected; });
    const err = await rejectionOf(() => solution.holdSeats(conn, { eventId: 1, seatIds: [1, 2], token: 'tok-a', now: NOON, ttlMs: MIN }));
    expect(err).toBe(injected);
    expect((await seat(1)).held_by).toBeNull();
    await closed();
  });

  it('rejects bad input with a RangeError before any query', async () => {
    const base = { eventId: 1, seatIds: [1, 2], token: 'tok-a', now: NOON, ttlMs: MIN };
    for (const patch of [{ eventId: 0 }, { eventId: '1' }, { seatIds: [] }, { seatIds: [1, 1] }, { seatIds: [1.5] },
      { seatIds: '1,2' }, { token: '' }, { now: 'noon' }, { ttlMs: 0 }, { ttlMs: 2.5 }]) {
      const spy = spyConn();
      const err = await rejectionOf(() => solution.holdSeats(spy.conn, { ...base, ...patch }));
      assert(err instanceof RangeError, `${JSON.stringify(patch)}: expected a RangeError, got ${err && err.name}`);
      expect(spy.calls).toEqual([]);
    }
  });
});

describe('confirmHold', () => {
  it('turns a live hold into an order and sells its seats', async () => {
    const { conn } = spyConn();
    await solution.holdSeats(conn, { eventId: 1, seatIds: [2, 1], token: 'tok-a', now: NOON, ttlMs: 10 * MIN });
    const out = await solution.confirmHold(conn, { token: 'tok-a', buyer: 'ada', now: later(9 * MIN) });
    const orders = await q("select id, event_id, buyer, hold_token from orders where hold_token = 'tok-a'");
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ event_id: 1, buyer: 'ada' });
    expect(out).toStrictEqual({ orderId: orders[0].id, seatIds: [1, 2] });
    for (const id of [1, 2]) expect(await seat(id)).toMatchObject({ order_id: orders[0].id, held_by: null, held_until: null });
    await closed();
  });

  it('returns the same order when confirmed again, and creates no second one', async () => {
    const { conn } = spyConn();
    await solution.holdSeats(conn, { eventId: 1, seatIds: [3], token: 'tok-a', now: NOON, ttlMs: 10 * MIN });
    const first = await solution.confirmHold(conn, { token: 'tok-a', buyer: 'ada', now: later(MIN) });
    const again = await solution.confirmHold(conn, { token: 'tok-a', buyer: 'ada', now: later(20 * MIN) });
    expect(again).toStrictEqual(first);
    expect(await orderCount()).toBe(2);
    await closed();
  });

  it('refuses an expired hold with HoldExpiredError and sells nothing', async () => {
    const { conn } = spyConn();
    await solution.holdSeats(conn, { eventId: 1, seatIds: [1], token: 'tok-a', now: NOON, ttlMs: 10 * MIN });
    const err = await rejectionOf(() => solution.confirmHold(conn, { token: 'tok-a', buyer: 'ada', now: later(10 * MIN) }));
    expect(err).toBeInstanceOf(solution.HoldExpiredError);
    expect(err.token).toBe('tok-a');
    expect(await orderCount()).toBe(1);
    expect((await seat(1)).order_id).toBeNull();
    await closed();
  });

  it('refuses when the expired hold was taken over by someone else', async () => {
    const { conn } = spyConn();
    await solution.holdSeats(conn, { eventId: 1, seatIds: [1, 2], token: 'tok-a', now: NOON, ttlMs: MIN });
    await solution.holdSeats(conn, { eventId: 1, seatIds: [2], token: 'tok-b', now: later(2 * MIN), ttlMs: 10 * MIN });
    const err = await rejectionOf(() => solution.confirmHold(conn, { token: 'tok-a', buyer: 'ada', now: later(3 * MIN) }));
    expect(err).toBeInstanceOf(solution.HoldExpiredError);
    expect((await seat(2)).held_by).toBe('tok-b');
    expect(await orderCount()).toBe(1);
  });

  it('refuses an unknown token with HoldExpiredError', async () => {
    const err = await rejectionOf(() => solution.confirmHold(spyConn().conn, { token: 'tok-nope', buyer: 'ada', now: NOON }));
    expect(err).toBeInstanceOf(solution.HoldExpiredError);
    await closed();
  });

  it('leaves no order and keeps the hold when selling the seats fails', async () => {
    const { conn } = spyConn();
    await solution.holdSeats(conn, { eventId: 1, seatIds: [1], token: 'tok-a', now: NOON, ttlMs: 10 * MIN });
    const injected = new Error('injected: disk full');
    const boom = spyConn((text) => { if (/^\s*update\s+seats\b/i.test(text)) throw injected; });
    const err = await rejectionOf(() => solution.confirmHold(boom.conn, { token: 'tok-a', buyer: 'ada', now: later(MIN) }));
    expect(err).toBe(injected);
    expect(await orderCount()).toBe(1);
    expect(await seat(1)).toMatchObject({ held_by: 'tok-a', order_id: null });
    await closed();
    const ok = await solution.confirmHold(conn, { token: 'tok-a', buyer: 'ada', now: later(2 * MIN) });
    expect(ok.seatIds).toEqual([1]);
  });
});

describe('releaseHold and availableSeats', () => {
  it('lists holdable seats: free ones and expired holds, by id', async () => {
    expect(await solution.availableSeats(spyConn().conn, { eventId: 1, now: NOON })).toEqual([
      { id: 1, label: 'A1' }, { id: 2, label: 'A2' }, { id: 3, label: 'A3' }, { id: 6, label: 'A6' },
    ]);
    const atTen = await solution.availableSeats(spyConn().conn, { eventId: 1, now: new Date('2024-05-01T12:10:00Z') });
    expect(atTen.map((s) => s.id)).toEqual([1, 2, 3, 4, 6]);
  });

  it('releases the unsold seats of a hold and resolves to how many', async () => {
    const { conn } = spyConn();
    await solution.holdSeats(conn, { eventId: 1, seatIds: [1, 2], token: 'tok-a', now: NOON, ttlMs: 10 * MIN });
    expect(await solution.releaseHold(conn, 'tok-a')).toBe(2);
    expect((await solution.availableSeats(conn, { eventId: 1, now: NOON })).map((s) => s.id)).toEqual([1, 2, 3, 6]);
    expect(await solution.releaseHold(conn, 'tok-a')).toBe(0);
    expect(await solution.releaseHold(conn, 'tok-zed')).toBe(0);
    expect((await seat(5)).order_id).toBe(1);
    await closed();
  });
});

describe('a busy afternoon', () => {
  it('never sells a seat twice and never loses one', async () => {
    const { conn } = spyConn();
    const tries = [
      () => solution.holdSeats(conn, { eventId: 1, seatIds: [1, 2], token: 'h1', now: NOON, ttlMs: 5 * MIN }),
      () => solution.holdSeats(conn, { eventId: 1, seatIds: [2, 3], token: 'h2', now: later(MIN), ttlMs: 5 * MIN }),
      () => solution.holdSeats(conn, { eventId: 1, seatIds: [3, 6], token: 'h3', now: later(MIN), ttlMs: 5 * MIN }),
      () => solution.confirmHold(conn, { token: 'h1', buyer: 'ada', now: later(2 * MIN) }),
      () => solution.holdSeats(conn, { eventId: 1, seatIds: [1], token: 'h4', now: later(3 * MIN), ttlMs: 5 * MIN }),
      () => solution.confirmHold(conn, { token: 'h3', buyer: 'cy', now: later(7 * MIN) }),
      () => solution.holdSeats(conn, { eventId: 1, seatIds: [3, 4], token: 'h5', now: later(11 * MIN), ttlMs: 5 * MIN }),
      () => solution.confirmHold(conn, { token: 'h5', buyer: 'dee', now: later(12 * MIN) }),
      () => solution.confirmHold(conn, { token: 'h1', buyer: 'ada', now: later(13 * MIN) }),
    ];
    const outcomes = [];
    for (const t of tries) {
      try {
        await t();
        outcomes.push('ok');
      } catch (e) {
        outcomes.push(e.name);
      }
      await closed();
    }
    expect(outcomes).toEqual([
      'ok', 'SeatUnavailableError', 'ok', 'ok', 'SeatUnavailableError', 'HoldExpiredError', 'ok', 'ok', 'ok',
    ]);
    const sold = await q('select s.id, o.buyer from seats s join orders o on o.id = s.order_id order by s.id');
    expect(sold.map((r) => [r.id, r.buyer])).toEqual([[1, 'ada'], [2, 'ada'], [3, 'dee'], [4, 'dee'], [5, 'zed']]);
    expect(await orderCount()).toBe(3);
  });
});

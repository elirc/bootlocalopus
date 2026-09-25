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
    truncate bookings restart identity;
    insert into bookings (event_id, customer, seats) values (1, 'ada', 4), (1, 'bob', 2), (3, 'cy', 2);
  `);
}
beforeEach(reset);
afterEach(async () => { if (await inTransaction()) await db.query('rollback'); });

/** Is the event row locked (or already updated) by the transaction currently open on the connection? */
async function eventLockedByMe(eventId) {
  const r = await db.query(
    `select (e.xmax::text = t.x or e.xmin::text = t.x) as mine
       from events e, (select pg_current_xact_id_if_assigned()::text as x) t
      where e.id = $1`,
    [eventId],
  );
  return r.rows.length > 0 && r.rows[0].mine === true;
}

/** The rival following the rules, in its own transaction: lock, sum, insert if it fits. */
async function rivalBooksProperly(eventId, seats) {
  await db.query('begin');
  try {
    const ev = await db.query('select capacity from events where id = $1 for update', [eventId]);
    const s = await db.query('select coalesce(sum(seats), 0)::int as n from bookings where event_id = $1', [eventId]);
    const fits = ev.rows[0].capacity - s.rows[0].n >= seats;
    if (fits) await db.query("insert into bookings (event_id, customer, seats) values ($1, 'rival', $2)", [eventId, seats]);
    await db.query('commit');
    return fits ? 'booked' : 'refused';
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

const touchesBookings = (text) => /\bbookings\b/i.test(text);
const isBegin = (t) => /^\s*(begin|start\s+transaction)\b/i.test(t);
const isCommit = (t) => /^\s*(commit|end)\b/i.test(t);
const isRollback = (t) => /^\s*rollback\b/i.test(t) && !/to\s+savepoint/i.test(t);
const isWrite = (t) => /^\s*(update|insert|delete)\b/i.test(t);

/**
 * A connection with only `query`, plus a rival booking of `rivalSeats` seats
 * for `eventId`. The rival lands right after your first statement that
 * touches `bookings`. If the event row was locked by you when that statement
 * was sent, the rival has to wait: call `settle()` after book() to run it.
 */
function contended(eventId, rivalSeats) {
  const calls = [];
  let phase = 'waiting-for-read'; // → 'decided' → 'done'
  let lockedAtRead = false;
  let rivalResult = null;
  const conn = {
    async query(text, params) {
      text = String(text);
      calls.push({ text, params: Array.isArray(params) ? [...params] : [] });
      if (phase === 'decided') {
        phase = 'done';
        if (!lockedAtRead) {
          // The rival read the old sum too, and commits before you do.
          await db.query("insert into bookings (event_id, customer, seats) values ($1, 'rival', $2)", [eventId, rivalSeats]);
          rivalResult = 'booked';
        }
      }
      if (phase === 'waiting-for-read' && touchesBookings(text)) {
        lockedAtRead = await eventLockedByMe(eventId);
        phase = 'decided';
      }
      return db.query(text, params);
    },
  };
  return {
    conn,
    calls,
    async settle() {
      if (rivalResult === null) rivalResult = await rivalBooksProperly(eventId, rivalSeats);
      return rivalResult;
    },
  };
}

function plain() {
  const calls = [];
  const conn = {
    query(text, params) {
      calls.push({ text: String(text), params: Array.isArray(params) ? [...params] : [] });
      return db.query(text, params);
    },
  };
  return { conn, calls };
}

async function booked(eventId) {
  const r = await q('select coalesce(sum(seats), 0)::int as n from bookings where event_id = $1', [eventId]);
  return r[0].n;
}
async function expectNoOverbooking() {
  const rows = await q(`select e.id, e.capacity, coalesce(sum(b.seats), 0)::int as n
                          from events e left join bookings b on b.event_id = e.id group by e.id order by e.id`);
  for (const r of rows) assert(r.n <= r.capacity, `event ${r.id} has ${r.n} seats booked and a capacity of ${r.capacity}`);
}
async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected book() to reject, but it resolved');
}

describe('booking', () => {
  it('books and returns { bookingId, seatsLeft }', async () => {
    const result = await solution.book(plain().conn, { eventId: 1, customer: 'dee', seats: 3 });
    const rows = await q("select id, event_id, seats from bookings where customer = 'dee'");
    expect(rows).toHaveLength(1);
    expect(result).toStrictEqual({ bookingId: rows[0].id, seatsLeft: 1 });
  });

  it('allows a booking that exactly fills the event', async () => {
    const result = await solution.book(plain().conn, { eventId: 2, customer: 'dee', seats: 3 });
    expect(result.seatsLeft).toBe(0);
    expect(await booked(2)).toBe(3);
  });

  it('refuses a booking that does not fit with SoldOutError, and rolls back', async () => {
    const { conn, calls } = plain();
    const err = await rejectionOf(() => solution.book(conn, { eventId: 1, customer: 'dee', seats: 5 }));
    expect(err).toBeInstanceOf(solution.SoldOutError);
    expect(err.eventId).toBe(1);
    expect(err.seatsLeft).toBe(4);
    expect(await booked(1)).toBe(6);
    assert(calls.some((c) => isRollback(c.text)), 'expected a ROLLBACK after the failure');
    assert(!(await inTransaction()), 'the connection was left inside a transaction');

    const full = await rejectionOf(() => solution.book(plain().conn, { eventId: 3, customer: 'dee', seats: 1 }));
    expect(full).toBeInstanceOf(solution.SoldOutError);
    expect(full.seatsLeft).toBe(0);
  });

  it('throws EventNotFoundError for a missing event', async () => {
    const err = await rejectionOf(() => solution.book(plain().conn, { eventId: 99, customer: 'dee', seats: 1 }));
    expect(err).toBeInstanceOf(solution.EventNotFoundError);
    expect(err.eventId).toBe(99);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('rejects bad input with a RangeError before any query', async () => {
    const bad = [{ seats: 0 }, { seats: -2 }, { seats: 1.5 }, { seats: '2' }, { seats: Number.NaN }, { customer: '' }, { customer: 7 }];
    for (const patch of bad) {
      const { conn, calls } = plain();
      const err = await rejectionOf(() => solution.book(conn, { eventId: 1, customer: 'dee', seats: 1, ...patch }));
      assert(err instanceof RangeError, `${JSON.stringify(patch)}: expected RangeError, got ${err && err.name}`);
      expect(calls).toHaveLength(0);
    }
  });

  it('does its writes inside one BEGIN … COMMIT', async () => {
    const { conn, calls } = plain();
    await solution.book(conn, { eventId: 2, customer: 'dee', seats: 1 });
    const texts = calls.map((c) => c.text);
    expect(texts.filter(isBegin)).toHaveLength(1);
    expect(texts.filter(isCommit)).toHaveLength(1);
    const b = texts.findIndex(isBegin);
    const c = texts.findIndex(isCommit);
    texts.forEach((t, i) => { if (isWrite(t)) assert(i > b && i < c, `this write ran outside the transaction:\n${t}`); });
  });

  it('rolls back and rethrows the original error when the insert fails', async () => {
    const injected = new Error('injected: connection reset');
    const calls = [];
    const conn = {
      async query(text, params) {
        calls.push(String(text));
        if (/^\s*insert/i.test(String(text))) throw injected;
        return db.query(text, params);
      },
    };
    const err = await rejectionOf(() => solution.book(conn, { eventId: 1, customer: 'dee', seats: 1 }));
    expect(err).toBe(injected);
    assert(calls.some(isRollback), 'expected a ROLLBACK after the failure');
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });
});

describe('two bookings at once', () => {
  it('does not overbook when a rival books the last seats mid-transaction', async () => {
    // 6 of 10 booked; you want 3, the rival wants 3. Only one of you fits.
    const c = contended(1, 3);
    const mine = await solution.book(c.conn, { eventId: 1, customer: 'dee', seats: 3 });
    const rival = await c.settle();
    await expectNoOverbooking();
    // You started first and held the lock, so you win and the rival is refused.
    expect(mine.seatsLeft).toBe(1);
    expect(rival).toBe('refused');
    expect(await booked(1)).toBe(9);
  });

  it('lets both through when both fit', async () => {
    const c = contended(1, 2);
    await solution.book(c.conn, { eventId: 1, customer: 'dee', seats: 2 });
    expect(await c.settle()).toBe('booked');
    expect(await booked(1)).toBe(10);
    await expectNoOverbooking();
  });

  it('holds the line on a small event too', async () => {
    const c = contended(2, 2);
    const mine = await solution.book(c.conn, { eventId: 2, customer: 'dee', seats: 2 });
    await c.settle();
    await expectNoOverbooking();
    expect(mine.seatsLeft).toBe(1);
    expect(await booked(2)).toBe(2);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });
});

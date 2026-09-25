export class SeatNotFoundError extends Error {
  constructor(seatIds) {
    super(`no such seats for this event: ${seatIds.join(', ')}`);
    this.name = 'SeatNotFoundError';
    this.seatIds = seatIds;
  }
}

export class SeatUnavailableError extends Error {
  constructor(seatIds) {
    super(`seats not available: ${seatIds.join(', ')}`);
    this.name = 'SeatUnavailableError';
    this.seatIds = seatIds;
  }
}

export class HoldExpiredError extends Error {
  constructor(token) {
    super(`hold ${token} has expired or does not exist`);
    this.name = 'HoldExpiredError';
    this.token = token;
  }
}

const isId = (v) => Number.isSafeInteger(v) && v > 0;
const isText = (v) => typeof v === 'string' && v.length > 0;
const isDate = (v) => v instanceof Date && !Number.isNaN(v.getTime());

async function inTransaction(conn, work) {
  await conn.query('begin');
  try {
    const result = await work();
    await conn.query('commit');
    return result;
  } catch (err) {
    await conn.query('rollback').catch(() => {});
    throw err;
  }
}

/**
 * Hold every seat in `seatIds` for `token` until now + ttlMs, or none of them.
 * Re-holding with the same token extends the hold (a retried request is safe).
 */
export async function holdSeats(conn, { eventId, seatIds, token, now, ttlMs } = {}) {
  if (!isId(eventId)) throw new RangeError('eventId must be a positive integer');
  if (!Array.isArray(seatIds) || seatIds.length === 0 || !seatIds.every(isId)) {
    throw new RangeError('seatIds must be a non-empty array of positive integers');
  }
  if (new Set(seatIds).size !== seatIds.length) throw new RangeError('seatIds must not repeat');
  if (!isText(token)) throw new RangeError('token must be a non-empty string');
  if (!isDate(now)) throw new RangeError('now must be a valid Date');
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new RangeError('ttlMs must be a positive integer');

  const ids = [...seatIds].sort((a, b) => a - b);
  const expiresAt = new Date(now.getTime() + ttlMs);

  return inTransaction(conn, async () => {
    // Lock the seats in id order, so two overlapping baskets cannot deadlock.
    const locked = await conn.query(
      'select id from seats where id = any($1::int[]) and event_id = $2 order by id for update',
      [ids, eventId],
    );
    const found = new Set(locked.rows.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) throw new SeatNotFoundError(missing);

    // The availability rule is in the WHERE, so the check and the write are
    // one step even without the lock above.
    const held = await conn.query(
      `update seats set held_by = $3, held_until = $4
        where id = any($1::int[]) and event_id = $2
          and order_id is null
          and (held_by is null or held_until <= $5 or held_by = $3)
        returning id`,
      [ids, eventId, token, expiresAt, now],
    );
    if (held.rows.length !== ids.length) {
      const got = new Set(held.rows.map((r) => r.id));
      throw new SeatUnavailableError(ids.filter((id) => !got.has(id)));
    }
    return { token, seatIds: ids, expiresAt };
  });
}

/**
 * Turn a live hold into an order. Confirming the same token again returns
 * the same order.
 */
export async function confirmHold(conn, { token, buyer, now } = {}) {
  if (!isText(token)) throw new RangeError('token must be a non-empty string');
  if (!isText(buyer)) throw new RangeError('buyer must be a non-empty string');
  if (!isDate(now)) throw new RangeError('now must be a valid Date');

  return inTransaction(conn, async () => {
    const existing = await conn.query('select id from orders where hold_token = $1', [token]);
    if (existing.rows.length > 0) {
      const orderId = existing.rows[0].id;
      const sold = await conn.query('select id from seats where order_id = $1 order by id', [orderId]);
      return { orderId, seatIds: sold.rows.map((r) => r.id) };
    }

    const held = await conn.query(
      'select id, event_id, held_until from seats where held_by = $1 and order_id is null order by id for update',
      [token],
    );
    if (held.rows.length === 0 || held.rows.some((r) => r.held_until <= now)) throw new HoldExpiredError(token);

    const order = await conn.query(
      'insert into orders (event_id, buyer, hold_token) values ($1, $2, $3) returning id',
      [held.rows[0].event_id, buyer, token],
    );
    const orderId = order.rows[0].id;
    const sold = await conn.query(
      `update seats set order_id = $1, held_by = null, held_until = null
        where held_by = $2 and order_id is null and held_until > $3
        returning id`,
      [orderId, token, now],
    );
    // Rows are locked, so this cannot differ; if it ever does, sell nothing.
    if (sold.rows.length !== held.rows.length) throw new HoldExpiredError(token);
    return { orderId, seatIds: held.rows.map((r) => r.id) };
  });
}

/** Give back every unsold seat held by `token`. Resolves to how many. */
export async function releaseHold(conn, token) {
  if (!isText(token)) throw new RangeError('token must be a non-empty string');
  const { rows } = await conn.query(
    'update seats set held_by = null, held_until = null where held_by = $1 and order_id is null returning id',
    [token],
  );
  return rows.length;
}

/** Seats of `eventId` that can be held at `now`: [{ id, label }] by id. */
export async function availableSeats(conn, { eventId, now } = {}) {
  if (!isId(eventId)) throw new RangeError('eventId must be a positive integer');
  if (!isDate(now)) throw new RangeError('now must be a valid Date');
  const { rows } = await conn.query(
    `select id, label from seats
      where event_id = $1 and order_id is null
        and (held_by is null or held_until <= $2)
      order by id`,
    [eventId, now],
  );
  return rows;
}

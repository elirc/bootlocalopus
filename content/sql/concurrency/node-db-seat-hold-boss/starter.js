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

/**
 * Hold every seat in `seatIds` for `token` until now + ttlMs, or none of them.
 *
 * The prototype: checks in JavaScript, writes seat by seat, no transaction,
 * and never looks at expiry.
 */
export async function holdSeats(conn, { eventId, seatIds, token, now, ttlMs }) {
  const { rows } = await conn.query('select id, held_by, order_id from seats where id = any($1::int[])', [seatIds]);
  const taken = rows.filter((r) => r.held_by || r.order_id).map((r) => r.id);
  if (taken.length > 0) throw new SeatUnavailableError(taken);
  const expiresAt = new Date(now.getTime() + ttlMs);
  for (const id of seatIds) {
    await conn.query('update seats set held_by = $1, held_until = $2 where id = $3', [token, expiresAt, id]);
  }
  return { token, seatIds, expiresAt };
}

export async function confirmHold(conn, { token, buyer, now }) {
  throw new Error('not implemented');
}

export async function releaseHold(conn, token) {
  throw new Error('not implemented');
}

export async function availableSeats(conn, { eventId, now }) {
  throw new Error('not implemented');
}

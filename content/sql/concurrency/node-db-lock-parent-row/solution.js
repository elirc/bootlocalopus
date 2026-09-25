export class EventNotFoundError extends Error {
  constructor(eventId) {
    super(`event ${eventId} does not exist`);
    this.name = 'EventNotFoundError';
    this.eventId = eventId;
  }
}

export class SoldOutError extends Error {
  constructor(eventId, seatsLeft) {
    super(`event ${eventId} has only ${seatsLeft} seats left`);
    this.name = 'SoldOutError';
    this.eventId = eventId;
    this.seatsLeft = seatsLeft;
  }
}

/**
 * Book `seats` for `customer`. Resolves to { bookingId, seatsLeft }.
 *
 * Every booking for an event first locks the event row, so bookings for the
 * same event run one at a time and each one sums what the previous one
 * committed. Bookings for other events are not affected.
 */
export async function book(conn, { eventId, customer, seats }) {
  if (!Number.isSafeInteger(seats) || seats <= 0) throw new RangeError('seats must be a positive integer');
  if (typeof customer !== 'string' || customer.length === 0) throw new RangeError('customer is required');

  await conn.query('begin');
  try {
    const result = await bookLocked(conn, eventId, customer, seats);
    await conn.query('commit');
    return result;
  } catch (err) {
    await conn.query('rollback').catch(() => {});
    throw err;
  }
}

async function bookLocked(conn, eventId, customer, seats) {
  // The lock comes first, on its own. A second booking blocks here until we
  // commit, and its sum below then includes our row.
  const event = await conn.query('select capacity from events where id = $1 for update', [eventId]);
  if (event.rows.length === 0) throw new EventNotFoundError(eventId);

  const booked = await conn.query(
    'select coalesce(sum(seats), 0)::int as booked from bookings where event_id = $1',
    [eventId],
  );
  const free = event.rows[0].capacity - booked.rows[0].booked;
  if (seats > free) throw new SoldOutError(eventId, free);

  const inserted = await conn.query(
    'insert into bookings (event_id, customer, seats) values ($1, $2, $3) returning id',
    [eventId, customer, seats],
  );
  return { bookingId: inserted.rows[0].id, seatsLeft: free - seats };
}

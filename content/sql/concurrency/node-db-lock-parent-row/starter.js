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
 * In production today: read, decide, insert. Two requests at once both see
 * the same free seats and both insert.
 */
export async function book(conn, { eventId, customer, seats }) {
  const event = await conn.query('select capacity from events where id = $1', [eventId]);
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

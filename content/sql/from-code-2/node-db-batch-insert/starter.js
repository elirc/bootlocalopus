/**
 * Insert every event. Resolves to the new ids, aligned with `events`.
 *
 * Today: one round trip per event (a 50,000-row import takes minutes), and
 * a failure at row 30,000 leaves 29,999 rows behind.
 */
export async function importEvents(conn, events, { batchSize = 500 } = {}) {
  throw new Error('not implemented: the loop below takes a round trip per event');
  // const ids = [];
  // for (const e of events) {
  //   const { rows } = await conn.query(
  //     'insert into events (external_id, kind, occurred_at, payload) values ($1, $2, $3, $4) returning id',
  //     [e.externalId, e.kind, e.occurredAt, JSON.stringify(e.payload)],
  //   );
  //   ids.push(rows[0].id);
  // }
  // return ids;
}

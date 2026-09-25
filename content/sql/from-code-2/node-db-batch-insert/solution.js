const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function validate(events, batchSize) {
  if (!Array.isArray(events)) throw new RangeError('events must be an array');
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new RangeError('batchSize must be a positive integer');
  const seen = new Set();
  events.forEach((e, i) => {
    const where = `events[${i}]`;
    if (!isPlainObject(e)) throw new RangeError(`${where} must be an object`);
    if (typeof e.externalId !== 'string' || e.externalId === '') throw new RangeError(`${where}.externalId is required`);
    if (typeof e.kind !== 'string' || e.kind === '') throw new RangeError(`${where}.kind is required`);
    if (!(e.occurredAt instanceof Date) || Number.isNaN(e.occurredAt.getTime())) throw new RangeError(`${where}.occurredAt must be a valid Date`);
    if (!isPlainObject(e.payload)) throw new RangeError(`${where}.payload must be an object`);
    if (seen.has(e.externalId)) throw new RangeError(`${where}.externalId ${e.externalId} is repeated`);
    seen.add(e.externalId);
  });
}

/**
 * Insert every event, in as few round trips as possible, all or nothing.
 * Resolves to the new ids, aligned with `events` (ids[i] is events[i]'s id).
 */
export async function importEvents(conn, events, { batchSize = 500 } = {}) {
  validate(events, batchSize);
  if (events.length === 0) return [];

  const idByExternalId = new Map();
  await conn.query('begin');
  try {
    for (let start = 0; start < events.length; start += batchSize) {
      const chunk = events.slice(start, start + batchSize);
      // Four parameters per statement, however many rows: one array per
      // column, zipped back into rows by unnest. A VALUES list would need
      // four parameters per row and hits the 65,535 limit at 16,384 rows.
      const { rows } = await conn.query(
        `insert into events (external_id, kind, occurred_at, payload)
         select * from unnest($1::text[], $2::text[], $3::timestamptz[], $4::jsonb[])
         returning id, external_id`,
        [
          chunk.map((e) => e.externalId),
          chunk.map((e) => e.kind),
          chunk.map((e) => e.occurredAt.toISOString()),
          chunk.map((e) => JSON.stringify(e.payload)),
        ],
      );
      // RETURNING promises no order: match rows back by their unique key.
      for (const r of rows) idByExternalId.set(r.external_id, r.id);
    }
    await conn.query('commit');
  } catch (err) {
    await conn.query('rollback').catch(() => {});
    throw err;
  }
  return events.map((e) => idByExternalId.get(e.externalId));
}

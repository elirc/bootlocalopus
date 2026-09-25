The nightly partner import inserts 50,000 events one `INSERT` at a time.
Each insert is fast; the 50,000 round trips to the database are not, and
the job takes eleven minutes. When row 30,000 fails, 29,999 rows stay
behind and the rerun trips over them.

Batching fixes the round trips, and one transaction fixes the half-import.
The obvious batch — one `VALUES (…), (…), …` list with four `$n` per row —
has a trap: a statement can carry at most **65,535 parameters**, so a
batch of 16,384 rows of four columns fails, and the batch size that worked
in testing breaks on the day the partner sends a bigger file.

Postgres has a neater shape: pass **one array per column** and let
`unnest` zip them back into rows. Four parameters per statement, however
many rows:

```sql
insert into events (external_id, kind, occurred_at, payload)
select * from unnest($1::text[], $2::text[], $3::timestamptz[], $4::jsonb[])
returning id, external_id;
```

Arrays of timestamps and JSON travel most reliably as strings:
`date.toISOString()` and `JSON.stringify(payload)`. And `RETURNING` does
not promise to return rows in input order, so match them back by a unique
key.

The fixture: `events(id serial, external_id text unique, kind,
occurred_at timestamptz, payload jsonb)`, holding one event,
`ext-existing`.

## Task

`importEvents(conn, events, { batchSize = 500 } = {})` resolves to the new
ids **aligned with the input**: `ids[i]` is the id of `events[i]`.

1. Validate everything first, and throw a `RangeError` before any query
   unless: `events` is an array of objects, each with a non-empty string
   `externalId` (no repeats within the input), a non-empty string `kind`,
   a valid `Date` `occurredAt`, and a plain-object `payload` (not `null`,
   not an array); and `batchSize` is a positive safe integer.
2. No events → resolve to `[]` without any query.
3. In **one transaction**, insert the events in chunks of `batchSize`,
   **one statement per chunk**. Any failure — a duplicate `external_id`
   in the database, say — rolls back every chunk and rethrows the
   database's error unchanged.
4. Every value goes in the parameter array.

## How it is graded

Through a connection with only `query`, counting statements. 2,500 events
at `batchSize: 1000` must be exactly 3 inserts; 1,001 at the default, 3.
Ids must line up with shuffled input; timestamps and JSON (with quotes in
it) must round-trip; 17,000 events with `batchSize: 17000` must succeed
with no statement over 65,535 parameters; a duplicate in the third chunk
must leave only the original row and a closed transaction (`err.code`
`'23505'`).

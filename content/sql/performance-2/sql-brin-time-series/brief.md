The `readings` table grows by a few million rows a day, and its B-tree on
`recorded_at` is now bigger than some of the tables it sits next to. Every
insert updates it, and most of it is never read: dashboards ask for "the
last six hours".

For an **append-only** table there is a much smaller index. Rows arrive in
time order, so the table is physically sorted by `recorded_at` already. A
**BRIN** (block range) index stores only the minimum and maximum value for
each range of, say, 32 pages. To find six hours of data, Postgres skips
every range whose min–max does not overlap and reads the rest — a Bitmap
Heap Scan that rechecks rows. The index is kilobytes instead of megabytes.

It only works when the column's order follows the physical order. Postgres
measures exactly that: `pg_stats.correlation`, from `1` (same order)
through `0` (scattered) to `-1` (reversed). On a scattered column every
block range spans nearly everything, so a BRIN index rules nothing out, and
you need a B-tree after all. And `pg_stats` is filled in by `ANALYZE`; on a
table nobody has analyzed, it is empty.

The fixture is `readings(id bigserial, sensor_id, recorded_at, device_time,
value)` with 20,000 rows. `recorded_at` is stamped by the ingest server as
rows arrive. `device_time` is the sensor's own clock: sensors buffer
offline for hours and some clocks are wrong, so its values are scattered
through the table. The table has not been analyzed.

## Task

1. Create a **BRIN** index named `readings_recorded_at_brin` on
   `recorded_at`, with `pages_per_range = 32`.
2. Create a **B-tree** index named `readings_device_time_idx` on
   `device_time` (and no BRIN index on it).
3. Make the statistics exist, and **end** with a query returning one row per
   column — `attname` and `correlation` from `pg_stats` — for
   `recorded_at` and `device_time` of `readings`, ordered by `attname`.

## How it is graded

The grader reads the indexes' access methods, columns and options from the
catalog; runs time-range queries on each column with `enable_seqscan` off
and expects the matching index in the plan; compares the BRIN index's size
with the primary key B-tree's (it must be under a tenth); and reads your
last statement's rows, expecting `recorded_at` above 0.99 and `device_time`
near 0.

In production, BRIN also needs the table to stay in order: bulk `UPDATE`s
that move rows, or backfilling old data, erode the correlation, and
`brin_summarize_new_values()` (or autovacuum) summarises newly filled
ranges.

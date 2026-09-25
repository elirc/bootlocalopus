-- Statistics first: pg_stats is empty until ANALYZE has sampled the table.
analyze readings;

-- recorded_at rises with the physical row order, so each block range of 32
-- pages covers a narrow, non-overlapping slice of time. BRIN stores just the
-- min and max per range: a few kilobytes where a B-tree needs an entry per row.
create index readings_recorded_at_brin on readings
  using brin (recorded_at) with (pages_per_range = 32);

-- device_time is scattered across the table: every block range would span
-- almost the whole month, and a BRIN index would rule nothing out. It needs
-- a B-tree.
create index readings_device_time_idx on readings (device_time);

-- The number that decides it: correlation between a column's order and the
-- rows' physical order, from 1 (same order) through 0 to -1 (reversed).
select attname, correlation
from pg_stats
where tablename = 'readings' and attname in ('recorded_at', 'device_time')
order by attname;

-- Append-only sensor readings. recorded_at is stamped by the ingest server
-- as each row arrives, so the table's physical order follows it. device_time
-- is what the sensor's own clock said: sensors buffer offline for hours, and
-- some clocks are simply wrong.
create table readings (
  id bigserial primary key,
  sensor_id integer not null,
  recorded_at timestamptz not null,
  device_time timestamptz not null,
  value real not null
);

insert into readings (sensor_id, recorded_at, device_time, value)
select
  g % 40,
  '2024-03-01T00:00:00Z'::timestamptz + g * interval '30 seconds',
  '2024-03-01T00:00:00Z'::timestamptz + ((g * 7919) % 20000) * interval '30 seconds',
  (g % 250) / 10.0
from generate_series(1, 20000) as g;

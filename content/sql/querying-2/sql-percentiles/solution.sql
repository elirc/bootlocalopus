select
  r.endpoint,
  count(*)::int as requests,
  -- The interpolated median; cast to numeric so round(x, 1) exists.
  round((percentile_cont(0.5) within group (order by r.duration_ms))::numeric, 1) as p50_ms,
  -- A real observed duration: the one you can find in the logs.
  percentile_disc(0.95) within group (order by r.duration_ms) as p95_ms,
  max(r.duration_ms) as max_ms,
  -- count(*) filter (...) is an integer; multiply by 1.0 first or it divides to 0.
  round(count(*) filter (where r.status >= 500) * 1.0 / count(*), 3) as error_rate
from request_logs r
group by r.endpoint
having count(*) >= 5
order by p95_ms desc, r.endpoint;

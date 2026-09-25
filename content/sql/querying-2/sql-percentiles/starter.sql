-- The average hides exactly the requests people complain about.
select
  endpoint,
  count(*)::int as requests,
  round(avg(duration_ms), 1) as p50_ms,
  max(duration_ms) as p95_ms,
  max(duration_ms) as max_ms,
  count(*) filter (where status >= 500) / count(*) as error_rate
from request_logs
group by endpoint
order by p95_ms desc, endpoint;

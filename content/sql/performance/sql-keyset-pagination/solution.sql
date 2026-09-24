select id, occurred_at, kind
from events
-- Row-value comparison: only falls back to id when occurred_at ties, which is
-- what keeps a page from skipping or repeating rows on duplicate timestamps.
where (occurred_at, id) < (timestamptz '2024-01-02 10:00:00+00', 4)
order by occurred_at desc, id desc
limit 3;

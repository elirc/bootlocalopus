-- TODO 1: a CHECK that payload->'items' is an array (missing counts as wrong)
-- TODO 2: event_type, generated from payload->>'type', plus a b-tree index
-- TODO 3: a GIN index on payload with jsonb_path_ops
-- TODO 4: the query below matches the wrong rows (KB-10, a note mentioning
--         KB-1) and can never use an index. Rewrite it with ->>, @> and
--         jsonb_path_exists, returning the columns in the brief.
select id
from events
where payload::text like '%order.placed%'
  and payload::text like '%KB-1%'
order by id;

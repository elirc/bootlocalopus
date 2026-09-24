-- 1. A CHECK passes when its expression is NULL, and jsonb_typeof(NULL) is
--    NULL: without the coalesce, a payload with no "items" key would slip in.
alter table events
  add constraint events_items_is_array
  check (coalesce(jsonb_typeof(payload->'items'), 'missing') = 'array');

-- 2. The hot key as a real column: Postgres keeps it in sync.
alter table events
  add column event_type text generated always as (payload->>'type') stored;

create index events_event_type_idx on events (event_type);

-- 3. jsonb_path_ops: smaller and faster than the default jsonb_ops for @>,
--    at the cost of the key-existence operators (?, ?|, ?&).
create index events_payload_gin on events using gin (payload jsonb_path_ops);

-- 4. Containment matches an array element that contains {"sku": "KB-1"},
--    by value: "KB-10" is a different string, and a note is not an item.
select
  e.id,
  (e.payload->>'order_id')::int as order_id,
  (e.payload->'customer'->>'id')::int as customer_id,
  e.payload->>'coupon' as coupon,
  (
    select sum((i->>'qty')::int * (i->>'unit_cents')::int)
    from jsonb_array_elements(e.payload->'items') as i
  )::int as total_cents,
  jsonb_path_exists(e.payload, '$.items[*] ? (@.qty >= 3)') as bulk
from events e
where e.payload @> '{"type": "order.placed", "items": [{"sku": "KB-1"}]}'
order by e.id;

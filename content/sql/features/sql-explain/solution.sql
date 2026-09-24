-- Key: what we search on (customer_id), then what we sort on, in the query's
-- own order, so the scan returns rows already sorted and LIMIT stops at 20.
-- INCLUDE: what we only return. It rides along in the leaf pages without
-- widening the key or taking part in the ordering.
create index orders_customer_recent_idx
  on orders (customer_id, placed_at desc, id desc)
  include (total_cents);

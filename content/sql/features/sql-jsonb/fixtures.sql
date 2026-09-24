create table events (
  id serial primary key,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

insert into events (payload) values
  -- 1: placed, contains KB-1, has a coupon
  ('{"type": "order.placed", "order_id": 1001, "customer": {"id": 7, "country": "GB"}, "coupon": "SPRING",
     "items": [{"sku": "KB-1", "qty": 1, "unit_cents": 9000}, {"sku": "CB-2", "qty": 2, "unit_cents": 1500}]}'),
  -- 2: placed, no KB-1
  ('{"type": "order.placed", "order_id": 1002, "customer": {"id": 9, "country": "US"},
     "items": [{"sku": "MS-3", "qty": 1, "unit_cents": 4500}]}'),
  -- 3: placed, KB-1 in bulk, no coupon key at all
  ('{"type": "order.placed", "order_id": 1003, "customer": {"id": 7, "country": "GB"},
     "items": [{"sku": "KB-1", "qty": 3, "unit_cents": 8500}]}'),
  -- 4: the cancellation of 1001: contains KB-1, but it is not a placed order
  ('{"type": "order.cancelled", "order_id": 1001, "customer": {"id": 7, "country": "GB"},
     "items": [{"sku": "KB-1", "qty": 1, "unit_cents": 9000}]}'),
  -- 5: placed, KB-10 (a different product whose sku starts with "KB-1")
  ('{"type": "order.placed", "order_id": 1004, "customer": {"id": 12, "country": "DE"},
     "items": [{"sku": "KB-10", "qty": 5, "unit_cents": 12000}]}'),
  -- 6: placed, KB-1 second in the list, coupon is JSON null, bulk via another item
  ('{"type": "order.placed", "order_id": 1005, "customer": {"id": 15, "country": "US"}, "coupon": null,
     "items": [{"sku": "CB-2", "qty": 4, "unit_cents": 1500}, {"sku": "KB-1", "qty": 1, "unit_cents": 9000}]}'),
  -- 7: placed, "KB-1" appears only in a free-text note
  ('{"type": "order.placed", "order_id": 1006, "customer": {"id": 30, "country": "FR"}, "note": "customer asked about KB-1",
     "items": [{"sku": "MS-3", "qty": 1, "unit_cents": 4500}]}'),
  -- 8: a refund with an empty items array (still an array)
  ('{"type": "order.refunded", "order_id": 1002, "customer": {"id": 9, "country": "US"}, "items": []}');

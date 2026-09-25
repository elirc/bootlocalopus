create table shipments (
  id serial primary key,
  order_ref text not null unique
);

create table shipment_events (
  id serial primary key,
  shipment_id int not null references shipments(id),
  status text not null,
  happened_at timestamptz not null
);

insert into shipments (order_ref) values
  ('ORD-1001'), ('ORD-1002'), ('ORD-1003'), ('ORD-1004'), ('ORD-1005');

insert into shipment_events (shipment_id, status, happened_at) values
  -- 1: a straightforward history.
  (1, 'label_created',    '2024-05-01 09:00+00'),
  (1, 'picked_up',        '2024-05-01 15:00+00'),
  (1, 'in_transit',       '2024-05-02 08:00+00'),
  -- 2: events arrive out of order; the id is not the timeline.
  (2, 'delivered',        '2024-05-03 12:00+00'),
  (2, 'label_created',    '2024-05-01 10:00+00'),
  (2, 'out_for_delivery', '2024-05-03 07:30+00'),
  -- 3: two events in the same second; the later-inserted one wins.
  (3, 'label_created',    '2024-05-02 11:00+00'),
  (3, 'exception',        '2024-05-04 18:00+00'),
  (3, 'returned_to_sender', '2024-05-04 18:00+00'),
  -- 4: one event.
  (4, 'label_created',    '2024-05-02 16:00+00');
  -- 5: nothing yet.

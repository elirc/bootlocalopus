-- DISTINCT ON fixes the inner ordering (shipment first, then newest event),
-- so the dashboard ordering has to be applied outside it.
select latest.*
from (
  select distinct on (s.id)
    s.id as shipment_id,
    s.order_ref,
    e.status,
    e.happened_at
  from shipments s
  -- A left join keeps shipments that have no events yet.
  left join shipment_events e on e.shipment_id = s.id
  -- e.id breaks ties between events with the same timestamp.
  order by s.id, e.happened_at desc nulls last, e.id desc
) latest
order by latest.happened_at desc nulls last, latest.shipment_id;

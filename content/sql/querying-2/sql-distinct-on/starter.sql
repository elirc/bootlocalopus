-- Gives the latest time, but not the status that goes with it.
select s.id as shipment_id, s.order_ref, max(e.happened_at) as happened_at
from shipments s
join shipment_events e on e.shipment_id = s.id
group by s.id, s.order_ref
order by s.id;

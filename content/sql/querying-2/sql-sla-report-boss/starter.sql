-- A start: tickets per team. Everything else is still to do.
select
  tm.name as team,
  count(*)::int as tickets,
  0 as open_tickets,
  0 as responded,
  null::numeric as median_response_min,
  0 as breached
from tickets t
join teams tm on tm.id = t.team_id
group by tm.name
order by tm.name;

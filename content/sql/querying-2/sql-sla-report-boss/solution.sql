with per_ticket as (
  select
    t.id,
    t.team_id,
    t.created_at,
    first_reply.at as first_response_at,
    t.created_at + sp.first_response_minutes * interval '1 minute' as deadline,
    coalesce(latest.status, 'open') as current_status
  from tickets t
  join sla_policies sp on sp.priority = t.priority
  -- Earliest agent reply by time, not by insertion order.
  left join lateral (
    select min(e.happened_at) as at
    from ticket_events e
    where e.ticket_id = t.id and e.kind = 'agent_reply'
  ) first_reply on true
  -- Latest status change; the id settles two changes at the same instant.
  left join lateral (
    select e.status
    from ticket_events e
    where e.ticket_id = t.id and e.kind = 'status_change'
    order by e.happened_at desc, e.id desc
    limit 1
  ) latest on true
),
classified as (
  select
    pt.id,
    pt.team_id,
    pt.current_status not in ('resolved', 'closed') as is_open,
    extract(epoch from pt.first_response_at - pt.created_at) / 60 as response_min,
    -- One fixed "now", so the report is reproducible.
    coalesce(pt.first_response_at, '2024-04-01 12:00:00+00'::timestamptz) > pt.deadline as is_breached
  from per_ticket pt
)
select
  case when grouping(tm.name) = 1 then 'All teams' else tm.name end as team,
  count(c.id)::int as tickets,
  count(c.id) filter (where c.is_open)::int as open_tickets,
  count(c.response_min)::int as responded,
  -- Ordered-set aggregates skip nulls, so unanswered tickets drop out.
  round((percentile_cont(0.5) within group (order by c.response_min))::numeric, 1) as median_response_min,
  count(c.id) filter (where c.is_breached)::int as breached
-- Teams first, so a team with no tickets still gets a row.
from teams tm
left join classified c on c.team_id = tm.id
-- The total row aggregates the tickets themselves: a median of medians is not a median.
group by rollup (tm.name)
order by grouping(tm.name), tm.name;

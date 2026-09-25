with active_days as (
  -- One row per user per UTC day: the pattern breaks on duplicates.
  select distinct
    a.user_id,
    (a.happened_at at time zone 'UTC')::date as day
  from activity a
),
numbered as (
  select
    ad.user_id,
    ad.day,
    -- Constant within a run of consecutive days, different for the next run.
    ad.day - (row_number() over (partition by ad.user_id order by ad.day))::int as island
  from active_days ad
)
select
  u.name,
  to_char(min(n.day), 'YYYY-MM-DD') as streak_start,
  to_char(max(n.day), 'YYYY-MM-DD') as streak_end,
  count(*)::int as days
from numbered n
join users u on u.id = n.user_id
group by u.id, u.name, n.island
order by u.name, min(n.day);

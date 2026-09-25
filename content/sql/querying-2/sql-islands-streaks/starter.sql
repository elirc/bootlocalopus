-- One row per active day. Turn these into runs of consecutive days.
select
  u.name,
  to_char(a.happened_at, 'YYYY-MM-DD') as streak_start,
  to_char(a.happened_at, 'YYYY-MM-DD') as streak_end,
  1 as days
from activity a
join users u on u.id = a.user_id
order by u.name, a.happened_at;

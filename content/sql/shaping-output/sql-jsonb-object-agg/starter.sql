-- Only users with overrides, and only what they overrode.
select
  u.id,
  u.email,
  jsonb_object_agg(us.key, us.value) as settings,
  jsonb_object_agg(us.key, us.value) as overrides
from users u
join user_settings us on us.user_id = u.id
group by u.id, u.email
order by u.id;

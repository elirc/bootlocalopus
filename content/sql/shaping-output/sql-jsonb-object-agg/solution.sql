select
  u.id,
  u.email,
  s.settings,
  s.overrides
from users u
cross join lateral (
  select
    -- Driven by the defaults, so every known key is present and retired keys
    -- (overrides with no default) never appear. coalesce() on the jsonb
    -- values keeps an explicit JSON null: it is a value, not SQL NULL.
    coalesce(jsonb_object_agg(d.key, coalesce(us.value, d.value)), '{}') as settings,
    -- The left join yields a NULL key where there is no override; skip those.
    -- Zero rows aggregate to SQL NULL, and the API wants {}.
    coalesce(jsonb_object_agg(us.key, us.value) filter (where us.key is not null), '{}') as overrides
  from setting_defaults d
  left join user_settings us on us.user_id = u.id and us.key = d.key
) s
order by u.id;

select
  u.id,
  -- An allow-list: a column added to users next year stays private until
  -- someone adds it here on purpose.
  -- jsonb_strip_nulls drops the keys whose value is null (bio, avatar_url);
  -- every other public column is NOT NULL, and '' is a value, not a null.
  jsonb_strip_nulls(jsonb_build_object(
    'id', u.id,
    'handle', u.handle,
    'display_name', u.display_name,
    'bio', u.bio,
    'avatar_url', u.avatar_url,
    'created_on', u.created_on
  )) as profile
from users u
where u.deleted_at is null
order by u.id;

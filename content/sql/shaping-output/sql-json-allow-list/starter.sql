-- The whole row: including email, password_hash and is_admin.
select u.id, to_jsonb(u) as profile
from users u
order by u.id;

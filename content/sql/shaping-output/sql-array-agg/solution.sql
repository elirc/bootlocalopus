-- Tags and comments are two independent one-to-many relationships: each is
-- aggregated on its own, so neither multiplies the other.
select
  p.id,
  p.title,
  t.tags,
  t.tag_line,
  c.comment_count
from posts p
cross join lateral (
  select
    -- Aggregates over zero rows return NULL; the API wants [] and ''.
    coalesce(array_agg(tg.name order by tg.name), '{}') as tags,
    coalesce(string_agg(tg.name, ', ' order by tg.name), '') as tag_line
  from post_tags pt
  join tags tg on tg.id = pt.tag_id
  where pt.post_id = p.id
) t
cross join lateral (
  select count(*)::int as comment_count
  from comments cm
  where cm.post_id = p.id
) c
where p.published
order by p.id;

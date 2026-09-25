select
  p.id,
  p.title,
  array_agg(tg.name order by tg.name) as tags,
  string_agg(tg.name, ', ' order by tg.name) as tag_line,
  count(cm.id)::int as comment_count
from posts p
left join post_tags pt on pt.post_id = p.id
left join tags tg on tg.id = pt.tag_id
left join comments cm on cm.post_id = p.id
where p.published
group by p.id, p.title
order by p.id;

-- What the search box runs today: a substring match that reads every row,
-- finds "pool" inside "Pool party", misses "deploying" when the text says
-- "deployed", and ranks nothing.
create function search_articles(p_query text)
returns table (id integer, title text, rank real)
language sql stable
as $$
  select a.id, a.title, 0::real as rank
  from articles a
  where a.title ilike '%' || p_query || '%' or a.body ilike '%' || p_query || '%'
  order by a.id
  limit 20;
$$;

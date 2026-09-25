-- The document, parsed once on write: lower-cased, stop words dropped,
-- words stemmed ("deploying", "deployed", "deployments" → "deploy").
-- Title words weigh A, body words B, so ts_rank scores a title hit higher.
-- GENERATED ... STORED keeps it in step with every insert and update.
alter table articles
  add column search tsvector
  generated always as (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', body), 'B')
  ) stored;

-- GIN indexes each lexeme, which is what @@ looks up. A B-tree cannot
-- answer "contains this word", and neither can LIKE '%word%'.
create index articles_search_idx on articles using gin (search);

-- websearch_to_tsquery accepts what people type into a search box: bare
-- words (AND), "quoted phrases", OR, and -exclusions, and never raises a
-- syntax error on odd input.
create function search_articles(p_query text)
returns table (id integer, title text, rank real)
language sql stable
as $$
  select a.id, a.title, ts_rank(a.search, query) as rank
  from articles a, websearch_to_tsquery('english', p_query) as query
  where a.published
    and a.search @@ query
  order by rank desc, a.id
  limit 20;
$$;

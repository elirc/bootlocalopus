The search box runs `title ilike '%' || $1 || '%'`. It reads every row
(a B-tree cannot answer "contains"), it finds "pool" in "Pool party" when
someone searches for connection pools, it misses "deploying" when the
article says "deployed", and it returns results in id order, so the one
article actually *about* the topic is on page three.

Postgres has a real search engine built in. `to_tsvector('english', text)`
parses a document into **lexemes**: lower-cased, stop words ("the", "and")
dropped, words stemmed ("deploying", "deployed", "deployments" → `deploy`).
`websearch_to_tsquery('english', input)` parses what people type into a
search box — words (all must match), `"quoted phrases"`, `or`, `-excluded`
— and never throws on odd input. `@@` matches one against the other, a
**GIN** index makes that a lookup, and `ts_rank` scores the match, counting
words by their weight: `setweight(…, 'A')` for the title outranks `'B'` for
the body.

Parse on write, not on read: a stored generated column keeps the vector in
step with every insert and update, and the index is on that column.

The fixture is `articles(id, title, body, published)`: a dozen real
articles (one unpublished draft) and 300 changelog entries.

## Task

1. Add `search tsvector`, **`generated always as (…) stored`**, built from
   the title with weight `A` and the body with weight `B`, both with the
   `'english'` configuration.
2. Create a GIN index named `articles_search_idx` on `search`.
3. Replace `search_articles(p_query text)`, which returns `table (id
   integer, title text, rank real)`: published articles matching
   `websearch_to_tsquery('english', p_query)`, with `rank = ts_rank(search,
   query)`, ordered by `rank` descending then `id`, at most 20 rows.

## How it is graded

The grader calls `search_articles` with: an inflected word (`deploying`
must find `deployed` and `deployments`), upper case, several words (AND), a
quoted phrase (whose words must be adjacent), `-exclusion`, `or`, an empty
string and punctuation-only input (no rows, no error), a stop word alone,
and a word matching more than 20 articles. It checks that a title match
ranks above a body match, that drafts never appear, that rows come in rank
order with ties by id, and that the column follows edits to the article.
It checks `search` is a stored generated `tsvector` and that
`search @@ websearch_to_tsquery(…)` uses `articles_search_idx` (with
`enable_seqscan` off).

A post has many tags and a tag has many posts. The tempting shortcuts both
hurt: a `tags text[]` column on `posts` cannot be foreign-keyed, so a typo'd
tag lives forever; a `tag_id` column on `posts` allows only one tag. The
answer is a **junction table**: one row per (post, tag) pair.

The junction table is where the modelling decisions actually live:

- **Its key is the pair.** A composite `primary key (post_id, tag_id)` makes
  "tagged twice" impossible without a surrogate id nobody queries by.
- **Each side gets its own delete policy.** Deleting a post should take its
  tag links with it. Deleting a tag that is still in use is almost always a
  mistake, so it should be *refused*.
- **The key serves only one direction.** A B-tree on `(post_id, tag_id)` answers
  "tags of post 7" but not "posts tagged `sql`": the leading column is what an
  index can seek on. The other direction needs its own index — Postgres does
  **not** create indexes for foreign keys.

The fixture already has `posts(id serial primary key, title text not null)`
with a few rows.

## Task

Create:

`tags`

- `id` — auto-incrementing primary key
- `name` — text, required, unique

`post_tags`

- `post_id` — required, references `posts(id)`; deleting a post **deletes** its
  `post_tags` rows
- `tag_id` — required, references `tags(id)`; deleting a tag that is still
  linked to any post must **fail** (a foreign key violation)
- `tagged_at` — `timestamptz`, required, defaulting to `now()`
- primary key `(post_id, tag_id)` — no surrogate `id` column is needed

Then make both lookups index-backed: there must be an index on `post_tags`
whose **leading** column is `post_id`, and one whose leading column is
`tag_id` (the primary key counts as one of them).

## How it is graded

The grader inserts posts, tags and links, expects a duplicate link to fail
with a unique violation, deletes posts and tags to check each policy, and
reads `pg_index` for the leading column of each index on `post_tags`.

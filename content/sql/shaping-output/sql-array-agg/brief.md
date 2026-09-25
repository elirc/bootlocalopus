The posts list endpoint needs each post with its tags and its comment count.
The ORM does it with 1 + 2N queries. The first hand-written SQL version does
it in one — and gets it wrong in two ways that only show on real data:

- **`{NULL}` instead of `{}`.** `array_agg` over a left join aggregates the
  null row that stands for "no match", so an untagged post gets an array
  containing one `null`. The API then renders a tag with no name.
  `array_agg(x) filter (where x is not null)` skips it — but an aggregate
  over zero rows returns `NULL`, not an empty array, so wrap it in
  `coalesce(..., '{}')`.
- **Fan-out.** Join `post_tags` *and* `comments` to `posts` in the same
  `FROM`, and a post with 3 tags and 4 comments becomes 12 rows: every tag
  appears 4 times and the comment count is 12. Two independent one-to-many
  relationships must be aggregated **separately** — in subqueries (correlated
  or `LATERAL`), or in pre-aggregated CTEs joined on the post id. `distinct`
  can hide the duplicated tags but not the multiplied count.

The fixture has `posts(id, title, published)`, `tags(id, name)`,
`post_tags(post_id, tag_id)` and `comments(id, post_id, body)`.

## Task

One query, one row per **published** post:

| column | type | value |
| --- | --- | --- |
| `id` | int | |
| `title` | text | |
| `tags` | `text[]` | tag names, alphabetical; `{}` (empty array, not null) when none |
| `tag_line` | text | the same names joined with `', '`; `''` when none |
| `comment_count` | int | number of comments on the post |

Order by `id`. `string_agg(name, ', ' order by name)` builds `tag_line`, and
`array_agg(name order by name)` the array.

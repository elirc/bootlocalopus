Rails and Laravel make "polymorphic associations" one line of code:
`commentable_type text, commentable_id int`. The database sees two plain
columns. There is **no foreign key** — there cannot be, because the target
table depends on a value in the row — so deleting a photo leaves its comments
pointing at nothing, a typo'd `'Phtoo'` is stored happily, and every join has
to remember to filter on the type.

The relational alternative is an **exclusive arc**: one nullable foreign key
per possible parent, plus a `CHECK` that exactly one of them is set. Every
reference is now a real foreign key with a real delete policy, and the
database guarantees the "exactly one" rule. When you need the polymorphic
shape back (for an activity feed, say), a view reconstructs it.

The fixture has `posts(id, title)` and `photos(id, caption)`, with rows.

## Task

1. Create `comments`:
   - `id` — auto-incrementing primary key
   - `body` — text, required
   - `post_id` — nullable, references `posts(id)`, cascade on delete
   - `photo_id` — nullable, references `photos(id)`, cascade on delete
   - a `CHECK` constraint that **exactly one** of `post_id`, `photo_id` is
     non-null (neither, and both, must be rejected)
2. Index each foreign key (an index whose leading column is `post_id`, and one
   whose leading column is `photo_id`). Partial indexes
   (`where post_id is not null`) are a good fit, since most rows have a null
   in one of the two.
3. Create a view `comment_feed` with one row per comment:

| column | type | value |
| --- | --- | --- |
| `id` | int | the comment id |
| `body` | text | |
| `target_type` | text | `'post'` or `'photo'` |
| `target_id` | int | the post's or photo's id |
| `target_label` | text | the post's `title`, or the photo's `caption` |

The view must include comments on both kinds of parent (a pair of inner joins
would return nothing, since no comment has both).

## How it is graded

The grader inserts comments with neither, both, and one parent, expecting a
check violation (`23514`) for the first two; inserts a comment for a missing
post expecting a foreign-key violation; deletes a post and a photo and checks
their comments went with them; and reads `comment_feed`.

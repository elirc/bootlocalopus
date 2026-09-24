`SELECT` then `INSERT` has a gap: two requests can both see "not there"
and both insert. `INSERT ... ON CONFLICT` closes the gap by making the
database decide, atomically, against a unique constraint.

The fixture has `page_views(page text primary key, views int not null,
last_seen timestamptz not null)` with two rows.

## Task

Write **one statement** that records a view of the page `'/pricing'`:

- if the page is new, insert it with `views = 1` and `last_seen = now()`
- if it exists, add 1 to its existing `views` and set `last_seen = now()`
- return the page and its new `views` count

Use `excluded` to refer to the row you proposed, and make the increment work
from the **stored** value — not from a value you computed in the application.
Every rule you enforce only in application code will eventually be broken
by a backfill script. Put the rules where the data lives.

## Task

Write the DDL for two tables.

`authors`

- `id` — auto-incrementing primary key
- `email` — text, required, **unique**
- `name` — text, required
- `joined_at` — date, required, defaulting to the current date

`books`

- `id` — auto-incrementing primary key
- `author_id` — required, references `authors(id)`, and deleting an author
  deletes their books
- `title` — text, required
- `price_cents` — integer, required, and **must be positive**
- `published_year` — integer, required, must be between 1450 and 2100

Money is in integer cents throughout this track — never floats.
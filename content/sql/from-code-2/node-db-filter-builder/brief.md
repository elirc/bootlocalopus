`GET /tickets?status=open&assignee=none&tag=urgent&q=refund` — every list
endpoint grows filters, and the code that turns them into SQL is where the
bugs live. The starter concatenates strings: an injection hole for every
field. The "parameterised" rewrite that usually follows has its own
classics:

- `$n` numbering that drifts when an optional filter is skipped, so a value
  lands in the wrong placeholder (or Postgres complains a parameter's type
  cannot be determined);
- `assignee_id = $1` with `null` for "unassigned", which matches **nothing**:
  `= NULL` is never true, you need `IS NULL`;
- `status = $1` with an array, where you need `= any($1::text[])`;
- `ilike '%' || $1 || '%'`, where a `%` or `_` in the search is a
  wildcard, so searching `_` matches every ticket.

The clean shape: a **table of supported filters**, each one validating its
value and producing a condition with its placeholder. Column names and
operators come only from that table; values only go into the parameter
array; placeholders are numbered from the parameter array as you push.

The fixture: `tickets(id, title, status, assignee_id, priority 1–4, tags
text[], created_at)`, 60 rows; `status` is `open`, `pending` or `closed`.

## Task

1. `buildWhere(filters)` → `{ clause, params }`: `clause` is `''` when there
   is nothing to filter, otherwise `'where '` followed by the conditions
   joined with `and`, using placeholders `$1`…`$n` for `params` in order.
   Supported filters (a key whose value is `undefined` is ignored):

   | key | value | matches tickets where |
   | --- | --- | --- |
   | `status` | one status, or a non-empty array of them | status is any of them |
   | `assigneeId` | positive safe integer, or `null` | `assignee_id` equals it; `null` means unassigned |
   | `minPriority` | integer 1–4 | `priority >=` it |
   | `tags` | non-empty array of non-empty strings | `tags` contains **all** of them (`@>`) |
   | `createdFrom` | valid `Date` | `created_at >=` it |
   | `createdTo` | valid `Date` | `created_at <` it |
   | `search` | non-empty string | the title contains it, case-insensitively, **literally** (`%` and `_` are ordinary characters) |

   Anything else — an unknown key (including inherited ones like
   `constructor`) or a bad value — throws `BadFilterError` (in the starter)
   with `.field` set to the key.
2. `listTickets(conn, filters = {}, { limit = 50 } = {})`: one query,
   newest first (`created_at desc, id desc`), at most `limit` rows
   (`limit` an integer 1–100, else `BadFilterError` with field `'limit'`),
   each mapped to `{ id, title, status, assigneeId, priority, tags,
   createdAt }`. Validate everything before the query.

## How it is graded

The grader runs fifteen filter combinations and compares the ids with its
own JavaScript reading of the table above — including `assigneeId: null`,
a search for `_` and for `100%`, and filters set to `undefined`. It checks
that one query runs with no value in its text, that a search of `' or 1=1
--` finds nothing, that every bad filter is refused before any query with
the right `.field`, and that `buildWhere`'s placeholders are exactly
`$1`…`$n` for its `params`.

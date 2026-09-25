`?offset=40&limit=20` has two production bugs. On a busy table, a row inserted
at the top while someone pages shifts everything down by one, so page 3
repeats the last item of page 2; a row deleted does the opposite and one item
is **never shown**. And `offset 100000` makes the database walk and discard
100,000 rows on every request.

**Cursor (keyset) pagination** fixes both. The cursor records the sort-key
values of the last row the client saw, and the next page is "rows that sort
strictly after those values". Inserts and deletes elsewhere cannot shift it.
The cursor is **opaque**: clients pass it back untouched, so you can change
its contents later without breaking anyone.

Here the "table" is an array (the SQL track does the same thing with a
`where (price, id) < ($1, $2)` clause); the API-side decisions are the same.

## Task

Export `CursorError` and `paginate(rows, { sort, limit = 20, cursor })`.

- `rows` — an unsorted array of plain objects. **Do not mutate it** (no
  in-place `rows.sort`).
- `sort` — `[{ field, dir }]`, `dir` `'asc'` or `'desc'`, e.g.
  `[{ field: 'price', dir: 'desc' }, { field: 'id', dir: 'asc' }]`. The last
  field is always unique, so the order is total. Compare values with `<` and
  `>` (numbers and strings; there are no nulls).
- `limit` — an integer from 1 to 100, else throw a `RangeError`.
- `cursor` — `undefined` for the first page, or a `nextCursor` you returned.

Return `{ items, nextCursor }`:

- `items` — up to `limit` rows, in `sort` order, that sort **strictly after**
  the cursor position (all rows from the start when there is no cursor).
- `nextCursor` — a string when **more rows exist** after this page, `null`
  otherwise. A page that exactly empties the list must return `null`, not a
  cursor to an empty page. (Fetch one extra row to find out.)

The cursor:

- is URL-safe: only `A–Z a–z 0–9 _ -` (base64url of some JSON works well);
- records the **values** of the last item's sort fields, not an index, so a
  page continues correctly even if rows were inserted before it or the last
  row the client saw was deleted;
- is only valid for the sort it was made with. A cursor from a different
  sort, or anything that does not decode to what you issued, throws a
  `CursorError` (`name` `'CursorError'`, `status` `400`, message
  `'invalid cursor'`) — never a `SyntaxError` or a `TypeError`.

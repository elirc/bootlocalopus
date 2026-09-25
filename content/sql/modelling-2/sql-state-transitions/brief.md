`status text check (status in ('pending', 'paid', ...))` stops typos. It
does not stop a `delivered` order going back to `pending` because a retry
replayed an old webhook, or a `cancelled` order being shipped. Those are rules
about **transitions**, not values, and they are what support tickets are made
of.

Put the rules in data. A **lookup table** of statuses gives every status a
row that other tables can reference (and that can carry attributes such as
`is_terminal`). A **transitions table** lists every allowed `(from, to)`
pair. A trigger then checks each status change against it. Allowing a new
transition next quarter is an `INSERT`, not a code change and a deploy.

The fixture has `orders(id serial primary key, customer text not null,
status text not null default 'pending')`, with rows in several statuses.

## Task

1. Create `order_statuses(code text primary key, is_terminal boolean not
   null)` containing exactly:
   `pending` (false), `paid` (false), `shipped` (false), `delivered` (true),
   `cancelled` (true).
2. Create `order_status_transitions(from_status, to_status)`, both required
   and both referencing `order_statuses(code)`, with the pair as its primary
   key. Insert exactly these five:
   `pending → paid`, `pending → cancelled`, `paid → shipped`,
   `paid → cancelled`, `shipped → delivered`.
3. Add a foreign key from `orders.status` to `order_statuses(code)`, so an
   unknown status is rejected with `23503`.
4. Add a `BEFORE UPDATE` trigger on `orders` that rejects any status change
   whose pair is not in `order_status_transitions`, by raising:

   ```sql
   raise exception 'invalid transition % -> %', old.status, new.status
     using errcode = 'check_violation';
   ```

   so the error code is `23514` and the message reads, for example,
   `invalid transition delivered -> pending`.

The trap: an update that sets `status` to the value it already has, or that
changes only another column, is not a transition and must succeed. The trigger
must read the table on every change, not a copy of it — the grader adds a
transition at runtime and expects it to be honoured.

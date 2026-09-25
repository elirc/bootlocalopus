"Show each shipment with its latest tracking event" is asked of every
event-sourced table. The usual first attempt is `max(happened_at)` in a
`group by`, which gives you the latest *time* but not the status that went
with it; joining back on the time then returns two rows whenever two events
share a timestamp.

Postgres has a direct answer: **`DISTINCT ON`**. It keeps the first row of
each group, where "first" is decided by the `ORDER BY`:

```sql
select distinct on (shipment_id) shipment_id, status, happened_at
from shipment_events
order by shipment_id, happened_at desc, id desc;
```

Two rules bite:

- The `DISTINCT ON` expressions must be the **leftmost** `ORDER BY` items, so
  the query's output is ordered by them. To order the result any other way,
  wrap it in a subquery and order outside.
- "First" must be unambiguous. Two events with the same `happened_at` need a
  tiebreaker (the `id`, which grows with insertion), or Postgres picks one
  arbitrarily and your API flickers between them.

The fixture has `shipments(id, order_ref)` and `shipment_events(id,
shipment_id, status, happened_at timestamptz)`.

## Task

One query, one row per **shipment** (including shipments with no events yet):

| column | value |
| --- | --- |
| `shipment_id` | |
| `order_ref` | |
| `status` | the status of the latest event; `NULL` if there are none |
| `happened_at` | when it happened; `NULL` if there are none |

"Latest" is the greatest `happened_at`; among events with the same
`happened_at`, the one with the greatest `id`.

Order the result by `happened_at` **descending with nulls last**, then
`shipment_id` ascending — the dashboard shows the most recently active
shipments first.

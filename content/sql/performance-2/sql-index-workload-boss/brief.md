The `tickets` table has picked up an index per incident for three years.
Inserts are slow, every index is maintained on every write, and the queries
that matter still sort thousands of rows. You have the full list of what
the application runs against the table. Design the index set for **that
workload**, within a budget, and remove what does not earn its keep.

The fixture: `tickets(id, tenant_id, status, priority, assignee_id,
subject, created_at, updated_at)`, 20,000 rows over 20 tenants. `status`
is one of `open`, `pending`, `solved`, `closed`; `priority` is 1–4 (4 is
urgent); `assignee_id` is null when unassigned. Current indexes:
`tickets_tenant_idx (tenant_id)`, `tickets_status_idx (status)`,
`tickets_tenant_status_idx (tenant_id, status)`, `tickets_subject_idx
(subject)`.

## The workload

```sql
-- W1: a tenant's open tickets, newest first
select id, subject, priority, created_at from tickets
where tenant_id = $1 and status = 'open'
order by created_at desc, id desc limit 50;

-- W2: an agent's queue: open and pending, most urgent first, then oldest
select id, subject, status, created_at from tickets
where assignee_id = $1 and status in ('open', 'pending')
order by priority desc, created_at, id limit 20;

-- W3: subject search within a tenant, case-insensitive prefix
select id, subject from tickets
where tenant_id = $1 and lower(subject) like 'refund%';

-- W4: pending tickets nobody has touched since a date, across all tenants
select id, tenant_id from tickets
where status = 'pending' and updated_at < $1
order by updated_at limit 100;

-- W5: a tenant's ticket counts by status
select status, count(*) from tickets where tenant_id = $1 group by status;
```

## Task

Write the migration (`drop index …`, `create index …`) so that:

1. **Every query seeks**: no `Seq Scan`, and the columns below appear in an
   `Index Cond` (searched through an index, not filtered afterwards):
   W1 `tenant_id` and `status`; W2 `assignee_id`; W3 `tenant_id` and
   `lower(subject)`; W4 `updated_at`; W5 `tenant_id`.
2. **W1, W2 and W4 never sort**: no `Sort` or `Incremental Sort` node. The
   index must hand rows over in the `ORDER BY`'s order, so `LIMIT` can stop
   early.
3. **At most four indexes** on `tickets` besides the primary key.
4. **No redundant index**: no plain B-tree whose key columns are a prefix
   of another plain B-tree's; and no index on `status` alone.

Traps worth knowing before you start:

- Put the **equality** columns first and the **order** columns after them.
  A column compared with `IN (…)` in the middle of the key breaks the order:
  the index yields one sorted run per value, and Postgres has to sort them
  together.
- A **partial** index (`… where status = 'pending'`) is used when the
  query's `WHERE` implies the index's: it can drop a low-selectivity
  column from the key entirely.
- The sandbox database uses the `C` collation, where a B-tree on
  `lower(subject)` serves `like 'refund%'`. Under other collations the same
  index needs the `text_pattern_ops` operator class.

## How it is graded

The grader runs `explain (format json)` for each query (for two different
parameter values where it applies) with `enable_seqscan` off, and checks
the plan nodes and their `Index Cond`s as above. It reads the index list
from `pg_index` (key columns via `pg_get_indexdef`) for the budget and the
redundancy rules.

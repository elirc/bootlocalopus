-- Out: indexes the workload never needs, or that another index already
-- provides. Each one is paid for on every insert and update.
drop index tickets_tenant_idx;          -- a prefix of (tenant_id, status, …)
drop index tickets_tenant_status_idx;   -- replaced by the longer index below
drop index tickets_status_idx;          -- four values: it narrows nothing
drop index tickets_subject_idx;         -- nobody searches the raw subject

-- W1 and W5: equality columns first, then the sort. The same index lets W1
-- stop after 50 entries and W5 count one tenant's statuses from the index.
create index tickets_tenant_status_created_idx
  on tickets (tenant_id, status, created_at desc, id desc);

-- W2: only open and pending tickets are ever in a queue, so index only
-- those rows, already in queue order.
create index tickets_assignee_queue_idx
  on tickets (assignee_id, priority desc, created_at, id)
  where status in ('open', 'pending');

-- W3: an expression index on what the query compares. (Under a non-C
-- collation, a LIKE prefix search needs lower(subject) text_pattern_ops.)
create index tickets_tenant_subject_idx
  on tickets (tenant_id, lower(subject));

-- W4: the stale-pending sweep across all tenants, oldest first.
create index tickets_pending_updated_idx
  on tickets (updated_at)
  where status = 'pending';

A self-referencing table (`parent_id`) needs recursion to walk. Doing it
in application code is N+1 queries deep; doing it in SQL is one.

```sql
with recursive t as (
  select ... -- the anchor: where to start
  union all
  select ... from table join t on ...  -- the step, referring to t itself
)
select * from t;
```

## Task

`categories(id, name, parent_id)` is a tree. Write one query returning every
category with:

| column | meaning |
| --- | --- |
| `id` | |
| `name` | |
| `depth` | 0 for roots, 1 for their children, and so on |
| `path` | names from the root joined with ` > `, e.g. `Tech > Laptops > Gaming` |
| `root_name` | the name of the top-level ancestor |

Order by `path`.

One thing this fixture does not have, and real data eventually does: a
**cycle**. If a bad write makes a category its own ancestor, a plain recursive
CTE never terminates. Guard against it by carrying the ids visited so far
(`ids || c.id`, and `where c.id <> all(t.ids)` in the step), or with
Postgres 14's `cycle id set is_cycle using ids` clause.
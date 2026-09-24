import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'sql-querying',
  title: 'Querying Like You Mean It',
  summary: 'Joins, aggregates, window functions, recursive CTEs and upserts.',
  lessons: [
    {
      id: 'sql-joins',
      title: 'Joins, including the ones people avoid',
      kind: 'sql',
      xp: 75,
      why: '"Which customers have never ordered?" is asked in every product meeting, and answered wrong with an inner join.',
      tags: ['joins', 'left join', 'anti-join'],
      hints: [
        'Start from `customers` and `left join orders`, so customers with no orders survive.',
        'The status filter must be part of the join condition (`on o.customer_id = c.id and o.status = \'paid\'`) — putting it in `where` removes the null rows and makes the left join behave like an inner join.',
        '`count(o.id)` counts non-null values, so it is naturally 0 for an unmatched customer. `count(*)` would return 1.',
        'For the sum, `coalesce(sum(o.total_cents), 0)` — `sum` over no rows is null, not 0.',
        'Group by the customer columns you select: `group by c.id, c.name, c.country`.',
      ],
    },
    {
      id: 'sql-aggregates',
      title: 'Aggregates, HAVING and FILTER',
      kind: 'sql',
      xp: 80,
      why: 'Reporting queries are most of the SQL a product engineer writes, and `FILTER` replaces a pile of CASE expressions.',
      tags: ['group by', 'having', 'aggregates'],
      hints: [
        'Join customers to orders with a left join so a country with no orders still counts its customers.',
        '`count(distinct c.id)` for the customer count — a plain `count` would multiply by the number of orders each customer has.',
        'Per-status counts in one pass: `count(*) filter (where o.status = \'paid\')`. Note `count(o.id) filter (...)` is safer with left joins, since `count(*)` counts the null row too.',
        'Averages: `coalesce(round(avg(o.total_cents) filter (where o.status = \'paid\')), 0)::int` — `round` on a numeric average, then cast.',
        '`having count(distinct c.id) >= 2` filters the groups. `where` cannot see an aggregate.',
      ],
    },
    {
      id: 'sql-windows',
      title: 'Window functions',
      kind: 'sql',
      xp: 95,
      why: '"Top 3 per group" and "running total" are impossible with GROUP BY alone and trivial with a window.',
      tags: ['window functions', 'ranking', 'analytics'],
      hints: [
        '`row_number() over (partition by o.customer_id order by o.placed_at, o.id)` gives the per-customer sequence; the `o.id` settles same-day orders.',
        'A running total is the same partition plus an `order by`. Adding `order by` inside `over` changes the frame from "the whole partition" to "everything up to this row **and its peers**" (rows with an equal sort key). Spell it out to get one row at a time: `sum(o.total_cents) over (partition by o.customer_id order by o.placed_at, o.id rows between unbounded preceding and current row)`.',
        'For the customer total, use the same partition with **no** `order by` — that frame is the entire partition.',
        '`rank() over (order by o.total_cents desc)` ranks across all rows and shares a rank for ties; `row_number` would break ties arbitrarily and `dense_rank` would not leave gaps.',
        'The `where status = \'paid\'` runs before the windows, so the windows only see paid orders — which is what you want here.',
      ],
    },
    {
      id: 'sql-recursive-cte',
      title: 'Recursive CTEs for trees',
      kind: 'sql',
      xp: 95,
      why: 'Category trees, org charts, comment threads, permission inheritance — all the same query shape.',
      tags: ['cte', 'recursion', 'hierarchies'],
      hints: [
        'The anchor selects the roots: `where parent_id is null`, with `0 as depth`, `name as path`, `name as root_name`.',
        'The recursive step joins the table to the CTE: `from categories c join tree t on c.parent_id = t.id`, with `t.depth + 1` and `t.path || \' > \' || c.name`.',
        'Both halves of the `union all` must have the same columns, in the same order, with compatible types.',
        '`root_name` just carries through unchanged in the recursive part: `t.root_name`.',
        'Cast the depth if the types disagree between branches — `0` is an integer literal, and `t.depth + 1` stays an integer, so this usually just works.',
      ],
    },
    {
      id: 'sql-upsert',
      title: 'Upserts without a race condition',
      kind: 'sql',
      xp: 85,
      why: '"Check if it exists, then insert or update" is a race condition. `ON CONFLICT` is the fix, in one statement.',
      tags: ['upsert', 'concurrency', 'constraints'],
      hints: [
        'The skeleton: `insert into page_views (page, views, last_seen) values (\'/pricing\', 1, now()) on conflict (page) do update set ...`',
        '`excluded` is the row you tried to insert. So `set last_seen = excluded.last_seen` reuses the `now()` you already wrote.',
        'For the count, read the stored row: `views = page_views.views + 1`. Qualifying it with the table name is what distinguishes the existing value from `excluded.views`.',
        'Add `returning page, views` to get the result back without a second query.',
        'The conflict target `(page)` must match a unique constraint or primary key — that is what makes the operation atomic.',
      ],
    },
  ],
});

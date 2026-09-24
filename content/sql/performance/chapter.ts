import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'sql-performance',
  title: 'Correctness & Performance',
  summary: 'Transactions, the N+1 problem, pagination that scales, and a reporting boss.',
  lessons: [
    {
      id: 'sql-transactions',
      title: 'Transactions and what can still go wrong',
      kind: 'quiz',
      xp: 70,
      why: 'Two users clicking at once is not an edge case, and "it worked in testing" is not isolation.',
      tags: ['transactions', 'isolation', 'concurrency'],
      quiz: [
        {
          q: 'Two requests both run `SELECT balance FROM accounts WHERE id = 1` (getting 100), then each writes `UPDATE accounts SET balance = 90`. Both are inside `BEGIN`/`COMMIT` at the default isolation level. What is the final balance?',
          options: [
            '80, because both deductions apply',
            '90 — one update is lost',
            'The second transaction fails with a serialisation error',
            '100, both roll back',
          ],
          answer: [1],
          explain: 'This is the classic lost update. Postgres\'s default READ COMMITTED does not prevent it: both transactions read 100, both write 90, and the second overwrites the first. The transaction boundary made each write atomic — it did nothing about the interleaving.',
        },
        {
          q: 'What fixes that lost update? Select all that work.',
          options: [
            'Do the arithmetic in the database: `UPDATE accounts SET balance = balance - 10 WHERE id = 1`',
            'Lock the row when reading: `SELECT ... FOR UPDATE`',
            'Use `SERIALIZABLE` isolation and retry on a serialisation failure',
            'Wrap the existing read and write in a transaction',
          ],
          answer: [0, 1, 2],
          explain: 'The first is best where it applies — the read and the write become one atomic statement, and the row is locked for its duration. `FOR UPDATE` makes the second transaction wait for the first to commit. SERIALIZABLE detects the conflict and aborts one, so your code must retry. Simply wrapping in a transaction, which is what the broken version already did, changes nothing.',
        },
        {
          q: 'What does Postgres\'s default READ COMMITTED level actually guarantee?',
          options: [
            'Each statement sees only data committed before that statement began',
            'The whole transaction sees one consistent snapshot from when it began',
            'No other transaction can write while yours is open',
            'Your reads are repeatable within the transaction',
          ],
          answer: [0],
          explain: 'The snapshot is taken per *statement*, not per transaction. So two identical `SELECT`s in one transaction can return different data if someone committed in between — a non-repeatable read. REPEATABLE READ is the level that gives you one snapshot for the whole transaction.',
        },
        {
          q: 'A long-running transaction holds a lock while your code makes an HTTP call to a payment provider. What is the problem?',
          options: [
            'Nothing, as long as the transaction commits eventually',
            'Locks are held for the whole network round trip, blocking other writers and burning a connection',
            'HTTP calls are not allowed inside transactions',
            'The transaction will automatically roll back after 30 seconds',
          ],
          answer: [1],
          explain: 'Keep transactions short and never wait on the network inside one. Locks and the connection are held for as long as it is open; a slow third party becomes your database outage. Do the external call outside the transaction and reconcile with an idempotency key.',
        },
        {
          q: 'You catch a unique-constraint violation inside a transaction and want to carry on with other work in the same transaction. What happens?',
          options: [
            'It works — the failed statement is skipped',
            'The transaction is aborted; every subsequent statement fails until you roll back (or roll back to a SAVEPOINT taken beforehand)',
            'Postgres retries the statement automatically',
            'Only that statement is rolled back, the rest continues normally',
          ],
          answer: [1],
          explain: 'In Postgres an error puts the transaction in a failed state: everything afterwards errors with "current transaction is aborted". If you need to continue, set a `SAVEPOINT` first and `ROLLBACK TO SAVEPOINT` on the error — which is exactly what an ORM\'s nested transaction does under the hood.',
        },
        {
          q: 'Which of these are true about `SELECT ... FOR UPDATE`? Select all.',
          options: [
            'It blocks other transactions that try to lock or update the same rows',
            'It must be inside a transaction to be useful',
            'It blocks plain `SELECT`s of those rows',
            'It can deadlock if two transactions lock the same rows in different orders',
          ],
          answer: [0, 1, 3],
          explain: 'Row locks do not block ordinary reads — Postgres readers never block writers and vice versa, thanks to MVCC. Outside a transaction the lock is released the moment the statement ends, making it pointless. And locking in inconsistent order across transactions is the standard recipe for a deadlock; lock in a consistent order (e.g. ascending id) to avoid it.',
        },
      ],
    },
    {
      id: 'sql-n-plus-one',
      title: 'Killing an N+1 with one query',
      kind: 'sql',
      xp: 90,
      why: 'The single most common cause of a slow endpoint. Recognising it in a log is a mid-level reflex.',
      tags: ['performance', 'n+1', 'json', 'lateral'],
      hints: [
        'Two things are being computed at different grains: the total count over all paid orders, and a list limited to 3. Do the count with a normal aggregate and the list with a per-customer subquery.',
        '`LATERAL` lets a subquery reference the row on its left: `left join lateral (select ... from orders o where o.customer_id = c.id and o.status = \'paid\' order by o.placed_at desc limit 3) recent on true`.',
        'Then `json_agg(...)` over the lateral rows. Alternatively, in a CTE add `row_number() over (partition by customer_id order by placed_at desc)` and filter `<= 3`.',
        'Format the date to match: `to_char(o.placed_at, \'YYYY-MM-DD\')`, since a raw date would serialise with a timestamp.',
        'Build each element with `json_build_object(\'id\', o.id, \'total_cents\', o.total_cents, \'placed_at\', to_char(...))`.',
        'Keep the ordering inside the aggregate: `json_agg(x order by ...)` — the order of rows going into an aggregate is not otherwise guaranteed.',
      ],
    },
    {
      id: 'sql-keyset-pagination',
      title: 'Pagination that stays fast on page 900',
      kind: 'sql',
      xp: 85,
      why: '`OFFSET 20000` reads and throws away 20,000 rows. Every infinite scroll should be keyset-based.',
      tags: ['pagination', 'performance', 'indexes'],
      hints: [
        'Descending order means "after the cursor" is "less than the cursor": `where (occurred_at, id) < (timestamptz \'2024-01-02 10:00:00+00\', 4)`.',
        'Row-value comparison compares left to right: it only looks at `id` when `occurred_at` is equal, which is exactly the tie-break you want.',
        'Then `order by occurred_at desc, id desc limit 3` — the ORDER BY must match the comparison, or you will page through the wrong sequence.',
        'Cast the literal so the comparison is timestamp-to-timestamp: `timestamptz \'2024-01-02 10:00:00+00\'`.',
        'Sanity check the expected answer by hand: sorted descending, the rows are 9, 8, 7, 6, 5, 4, 3, 2, 1 — so after id 4 comes 3, then 2, then 1.',
      ],
    },
    {
      id: 'sql-analytics-boss',
      title: 'BOSS: the monthly revenue report',
      kind: 'sql',
      xp: 250,
      boss: true,
      why: 'The query someone asks you for in week two of a data-heavy team, using every tool from this track at once.',
      tags: ['cte', 'window functions', 'aggregates', 'reporting'],
      hints: [
        'Generate the months: `select generate_series(\'2024-01-01\'::date, \'2024-03-01\'::date, interval \'1 month\') as month_start`.',
        'Aggregate the orders by month in their own CTE: `select date_trunc(\'month\', placed_at)::date as month_start, count(*) ... from orders where status = \'paid\' group by 1`.',
        'Then `left join` the aggregates onto the months, so a month with no rows still appears — with nulls you coalesce to 0.',
        'Format with `to_char(m.month_start, \'YYYY-MM\')`.',
        'The running total is a window over the joined result: `sum(coalesce(revenue, 0)) over (order by m.month_start)`. Coalesce *before* the window, or a null month breaks the accumulation.',
        'Previous month: `lag(coalesce(revenue, 0), 1, 0) over (order by m.month_start)`. The third argument to `lag` is the default for the first row, which saves a coalesce.',
        'Guard the division: `case when prev = 0 then 0 else round((current - prev) * 100.0 / prev, 1) end`. Multiply by `100.0`, not `100`, or integer division truncates.',
        'You will need the lag value in two places (the column and the growth calculation). Compute the windows in one CTE and do the arithmetic in an outer select — window functions cannot be nested inside each other.',
      ],
    },
  ],
});

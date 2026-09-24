import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'sql-features',
  title: 'Postgres features you will actually use',
  summary: 'JSONB you can query, constrain and index, and reading EXPLAIN well enough to fix the plan.',
  lessons: [
    {
      id: 'sql-jsonb',
      title: 'JSONB: querying, constraining, indexing',
      kind: 'sql',
      xp: 95,
      why: 'Every product ends up with a `payload jsonb` column; the difference between a useful one and a landfill is operators, a CHECK and the right index.',
      tags: ['jsonb', 'gin', 'generated columns', 'check constraints'],
      hints: [
        'Four statements then the query: `alter table events add constraint … check (…)`, `alter table events add column event_type text generated always as (…) stored`, two `create index`es, then the `select`.',
        'A CHECK passes when its expression is NULL, and `jsonb_typeof(payload->\'items\')` is NULL when the key is missing. `coalesce(jsonb_typeof(payload->\'items\'), \'missing\') = \'array\'` closes that hole.',
        'Filter with containment, which the GIN index can serve: `payload @> \'{"type": "order.placed", "items": [{"sku": "KB-1"}]}\'`. An array in the pattern matches if the stored array contains an element that contains `{"sku": "KB-1"}` — exact value, so `KB-10` does not match.',
        '`->` returns jsonb, `->>` returns text: `(payload->\'customer\'->>\'id\')::int`, `payload->>\'coupon\'` (NULL both when the key is absent and when it holds JSON `null`). `bulk` is `jsonb_path_exists(payload, \'$.items[*] ? (@.qty >= 3)\')`.',
        'Total with a scalar subquery over the array: `(select sum((i->>\'qty\')::int * (i->>\'unit_cents\')::int) from jsonb_array_elements(payload->\'items\') as i)::int`. Index: `create index events_payload_gin on events using gin (payload jsonb_path_ops)`.',
      ],
    },
    {
      id: 'sql-explain',
      title: 'Reading EXPLAIN and fixing the plan',
      kind: 'sql',
      xp: 85,
      why: '"Add an index" is only a fix when you can read the plan and say which node the index removes.',
      tags: ['explain', 'indexes', 'covering index', 'performance'],
      hints: [
        'Two costs in the plan have nothing to do with finding rows: the Bitmap Heap Scan (visiting the table for columns the index does not have) and the Sort (ordering all 6,030 rows to keep 20).',
        'A B-tree returns entries in key order. If the key is `(customer_id, placed_at, id)`, all of one customer\'s rows are adjacent and already ordered by date — so no Sort, and `LIMIT` stops after 20.',
        'Match the query\'s direction: `placed_at desc, id desc`. (A B-tree can also be walked backwards, so all-ascending works too; mixing directions — `placed_at desc, id asc` — would not.)',
        'An Index Only Scan needs every column the query reads to be in the index. `total_cents` is only returned, never searched or sorted, so it belongs in `INCLUDE (total_cents)` rather than the key.',
        '`create index orders_customer_recent_idx on orders (customer_id, placed_at desc, id desc) include (total_cents);`',
      ],
    },
  ],
});

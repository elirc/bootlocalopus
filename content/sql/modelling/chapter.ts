import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'sql-modelling',
  title: 'Modelling Data',
  summary: 'Constraints, normalisation, migrations and indexes — the schema is your last line of defence.',
  lessons: [
    {
      id: 'sql-constraints',
      title: 'A schema that refuses bad data',
      kind: 'sql',
      xp: 75,
      why: 'Application validation can be bypassed by a script, a migration, or a colleague with psql. Constraints cannot.',
      tags: ['ddl', 'constraints', 'foreign keys'],
      hints: [
        '`id serial primary key` gives you the auto-incrementing key (`generated always as identity` is the modern equivalent and also fine).',
        '`email text not null unique` — `not null` and `unique` are separate constraints and you need both.',
        '`joined_at date not null default current_date` for the default.',
        'The foreign key with cascade: `author_id int not null references authors(id) on delete cascade`.',
        'Range rules are check constraints: `price_cents int not null check (price_cents > 0)`, and `check (published_year between 1450 and 2100)`.',
      ],
    },
    {
      id: 'sql-normalise',
      title: 'Normalising a spreadsheet',
      kind: 'sql',
      xp: 85,
      why: 'The table you inherit is always a CSV someone imported. Splitting it correctly is a routine mid-level task.',
      tags: ['normalisation', 'ddl', 'insert-select'],
      hints: [
        '`insert into companies (name, country) select distinct company_name, company_country from signups_raw;` — `distinct` applies across the whole selected row.',
        'For people, join back to the table you just filled: `insert into people (name, email, company_id) select r.person_name, r.person_email, c.id from signups_raw r join companies c on c.name = r.company_name;`',
        'Order matters: create both tables, insert companies, then insert people — the foreign key needs the company rows to exist first.',
        'Statements in one script run in order, so you can rely on the previous insert having happened.',
      ],
    },
    {
      id: 'sql-migration',
      title: 'Migrating a live table without an outage',
      kind: 'sql',
      xp: 90,
      why: 'Which lock each migration step takes is the difference between a deploy and an outage.',
      tags: ['migrations', 'alter table', 'locking', 'operations'],
      hints: [
        '`alter table accounts add column plan text not null default \'free\';` — a constant default has been metadata-only since Postgres 11, so this is instant.',
        'A named check in two steps: `alter table accounts add constraint accounts_plan_valid check (plan in (...)) not valid;` then `alter table accounts validate constraint accounts_plan_valid;`.',
        'Forgetting the `validate` step leaves `convalidated = false` in `pg_constraint`: old rows were never checked.',
        '`create unique index accounts_email_lower_idx on accounts (lower(email));` — an expression index is how you enforce case-insensitive uniqueness. (In production, `concurrently`, outside a transaction.)',
      ],
    },
    {
      id: 'sql-indexes',
      title: 'Indexes for the queries you actually run',
      kind: 'sql',
      xp: 85,
      why: 'Indexing every column is as wrong as indexing none. The index has to match the query.',
      tags: ['indexes', 'performance', 'ddl'],
      hints: [
        'For query A: `create index orders_customer_placed_idx on orders (customer_id, placed_at);` — the equality column comes first, the ordering column second. `desc` is optional: a b-tree can be read backwards, so `(customer_id, placed_at)` already serves `order by placed_at desc`. Direction only matters for mixed orders like `a asc, b desc`.',
        'For query B, the filter is a constant, so bake it into the index: `create index orders_pending_idx on orders (placed_at) where status = \'pending\';` The index then contains only pending rows.',
        'For query C, index the expression you filter on: `create unique index customers_email_lower_idx on customers (lower(email));`',
        'You can confirm what Postgres chose with `explain select ...` — the tests do exactly that.',
      ],
    },
  ],
});

import { track } from '../types.ts';

/** Shared shop fixture: money is stored in integer cents on purpose. */
const SHOP = `
create table customers (
  id serial primary key,
  name text not null,
  email text not null unique,
  country text not null,
  created_at date not null
);

create table orders (
  id serial primary key,
  customer_id int not null references customers(id) on delete cascade,
  status text not null,
  total_cents int not null,
  placed_at date not null
);

create table order_items (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  product text not null,
  quantity int not null,
  unit_cents int not null
);

insert into customers (name, email, country, created_at) values
  ('Ada',   'ada@example.com',   'GB', '2023-11-02'),
  ('Bob',   'bob@example.com',   'US', '2023-12-14'),
  ('Chen',  'chen@example.com',  'US', '2024-01-05'),
  ('Dara',  'dara@example.com',  'GB', '2024-01-20'),
  ('Elif',  'elif@example.com',  'DE', '2024-02-02'),
  ('Farid', 'farid@example.com', 'DE', '2024-02-11');

insert into orders (customer_id, status, total_cents, placed_at) values
  (1, 'paid',      12000, '2024-01-03'),
  (1, 'paid',       4500, '2024-01-28'),
  (1, 'cancelled',  9900, '2024-02-04'),
  (2, 'paid',      31000, '2024-01-11'),
  (2, 'pending',    2500, '2024-02-17'),
  (3, 'paid',       7800, '2024-02-06'),
  (3, 'paid',      15000, '2024-02-21'),
  (3, 'refunded',   3300, '2024-02-25'),
  (4, 'paid',        990, '2024-02-27'),
  (5, 'pending',   45000, '2024-02-28');

insert into order_items (order_id, product, quantity, unit_cents) values
  (1, 'Keyboard', 1, 9000), (1, 'Cable', 2, 1500),
  (2, 'Mouse',    1, 4500),
  (4, 'Monitor',  1, 28000), (4, 'Cable', 2, 1500),
  (6, 'Mouse',    1, 4500), (6, 'Mousepad', 3, 1100),
  (7, 'Monitor',  1, 15000),
  (9, 'Cable',    1, 990);
`;

export const sqlTrack = track({
  id: 'sql',
  title: 'Postgres & Data Modelling',
  icon: '🐘',
  color: '#336791',
  weight: 1.1,
  blurb: 'Schema design that prevents bad data, queries that answer real questions, and the performance traps that make an ORM look slow. Graded by running your SQL against a real Postgres.',
  chapters: [
    /* ================================================================== */
    {
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
          brief: `Every rule you enforce only in application code will eventually be broken
by a backfill script. Put the rules where the data lives.

## Task

Write the DDL for two tables.

\`authors\`

- \`id\` — auto-incrementing primary key
- \`email\` — text, required, **unique**
- \`name\` — text, required
- \`joined_at\` — date, required, defaulting to the current date

\`books\`

- \`id\` — auto-incrementing primary key
- \`author_id\` — required, references \`authors(id)\`, and deleting an author
  deletes their books
- \`title\` — text, required
- \`price_cents\` — integer, required, and **must be positive**
- \`published_year\` — integer, required, must be between 1450 and 2100

Money is in integer cents throughout this track — never floats.`,
          starter: `-- TODO: create the authors table, then the books table

`,
          hints: [
            '`id serial primary key` gives you the auto-incrementing key (`generated always as identity` is the modern equivalent and also fine).',
            '`email text not null unique` — `not null` and `unique` are separate constraints and you need both.',
            '`joined_at date not null default current_date` for the default.',
            'The foreign key with cascade: `author_id int not null references authors(id) on delete cascade`.',
            'Range rules are check constraints: `price_cents int not null check (price_cents > 0)`, and `check (published_year between 1450 and 2100)`.',
          ],
          solution: `create table authors (
  id serial primary key,
  email text not null unique,
  name text not null,
  joined_at date not null default current_date
);

create table books (
  id serial primary key,
  author_id int not null references authors(id) on delete cascade,
  title text not null,
  price_cents int not null check (price_cents > 0),
  published_year int not null check (published_year between 1450 and 2100)
);
`,
          tests: `const newAuthor = async (email = 'a@x.com') => {
  const rows = await q(
    "insert into authors (email, name) values ($1, 'Ada') returning id",
    [email],
  );
  return num(rows[0].id);
};

describe('the tables exist with the right columns', () => {
  it('creates authors and books', async () => {
    const tables = await q(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(tables.map((r) => r.table_name)).toEqual(['authors', 'books']);
  });

  it('gives authors the expected columns', async () => {
    const cols = await q(
      "select column_name, is_nullable from information_schema.columns where table_name = 'authors' order by column_name",
    );
    expect(cols.map((c) => c.column_name)).toEqual(['email', 'id', 'joined_at', 'name']);
    expect(cols.every((c) => c.is_nullable === 'NO')).toBe(true);
  });

  it('gives books the expected columns', async () => {
    const cols = await q(
      "select column_name from information_schema.columns where table_name = 'books' order by column_name",
    );
    expect(cols.map((c) => c.column_name))
      .toEqual(['author_id', 'id', 'price_cents', 'published_year', 'title']);
  });

  it('makes id the primary key of each table', async () => {
    const rows = await q(
      "select tc.table_name, kcu.column_name from information_schema.table_constraints tc " +
      'join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name ' +
      "where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public' order by tc.table_name",
    );
    expect(rows).toEqual([
      { table_name: 'authors', column_name: 'id' },
      { table_name: 'books', column_name: 'id' },
    ]);
  });
});

describe('happy path', () => {
  it('accepts a valid author and book, auto-assigning ids', async () => {
    const authorId = await newAuthor();
    expect(authorId).toBeGreaterThan(0);

    const book = await q(
      'insert into books (author_id, title, price_cents, published_year) ' +
      "values ($1, 'A Book', 1999, 2024) returning id",
      [authorId],
    );
    expect(num(book[0].id)).toBeGreaterThan(0);
  });

  it('defaults joined_at to today', async () => {
    const authorId = await newAuthor();
    const rows = await q('select (joined_at = current_date) as is_today from authors where id = $1', [authorId]);
    expect(rows[0].is_today).toBe(true);
  });
});

describe('constraints actually fire', () => {
  it('rejects a duplicate email', async () => {
    await newAuthor('dup@x.com');
    await expect(q("insert into authors (email, name) values ('dup@x.com', 'Impostor')"))
      .rejects.toThrow();
  });

  it('rejects a missing email', async () => {
    await expect(q("insert into authors (name) values ('No Email')")).rejects.toThrow();
  });

  it('rejects a missing name', async () => {
    await expect(q("insert into authors (email) values ('b@x.com')")).rejects.toThrow();
  });

  it('rejects a book with no author', async () => {
    await expect(q(
      "insert into books (title, price_cents, published_year) values ('Orphan', 100, 2024)",
    )).rejects.toThrow();
  });

  it('rejects a book pointing at an author that does not exist', async () => {
    await expect(q(
      'insert into books (author_id, title, price_cents, published_year) ' +
      "values (999999, 'Ghost', 100, 2024)",
    )).rejects.toThrow();
  });

  it('rejects a zero price', async () => {
    const authorId = await newAuthor();
    await expect(q(
      "insert into books (author_id, title, price_cents, published_year) values ($1, 'Free', 0, 2024)",
      [authorId],
    )).rejects.toThrow();
  });

  it('rejects a negative price', async () => {
    const authorId = await newAuthor();
    await expect(q(
      "insert into books (author_id, title, price_cents, published_year) values ($1, 'Owed', -500, 2024)",
      [authorId],
    )).rejects.toThrow();
  });

  it('rejects a publication year before 1450', async () => {
    const authorId = await newAuthor();
    await expect(q(
      "insert into books (author_id, title, price_cents, published_year) values ($1, 'Ancient', 100, 1449)",
      [authorId],
    )).rejects.toThrow();
  });

  it('rejects a publication year after 2100', async () => {
    const authorId = await newAuthor();
    await expect(q(
      "insert into books (author_id, title, price_cents, published_year) values ($1, 'Future', 100, 2101)",
      [authorId],
    )).rejects.toThrow();
  });

  it('accepts the boundary years', async () => {
    const authorId = await newAuthor();
    for (const year of [1450, 2100]) {
      const rows = await q(
        'insert into books (author_id, title, price_cents, published_year) ' +
        "values ($1, 'Edge', 100, $2) returning published_year",
        [authorId, year],
      );
      expect(num(rows[0].published_year)).toBe(year);
    }
  });
});

describe('cascade', () => {
  it('deletes the books of a deleted author', async () => {
    const authorId = await newAuthor('cascade@x.com');
    await q(
      'insert into books (author_id, title, price_cents, published_year) values ' +
      "($1, 'One', 100, 2020), ($1, 'Two', 200, 2021)",
      [authorId],
    );
    const before = await q('select count(*)::int as c from books where author_id = $1', [authorId]);
    expect(num(before[0].c)).toBe(2);

    await q('delete from authors where id = $1', [authorId]);

    const after = await q('select count(*)::int as c from books where author_id = $1', [authorId]);
    expect(num(after[0].c)).toBe(0);
  });
});
`,
        },
        {
          id: 'sql-normalise',
          title: 'Normalising a spreadsheet',
          kind: 'sql',
          xp: 85,
          why: 'The table you inherit is always a CSV someone imported. Splitting it correctly is a routine mid-level task.',
          tags: ['normalisation', 'ddl', 'insert-select'],
          brief: `\`signups_raw\` is what happens when a spreadsheet becomes a table: the
company name and country repeat on every row, so a rename has to be applied in
a hundred places and one typo creates a second company.

The fixture already contains:

\`\`\`sql
signups_raw(id, person_name, person_email, company_name, company_country)
\`\`\`

## Task

In one script:

1. Create \`companies(id serial primary key, name text not null unique,
   country text not null)\`.
2. Create \`people(id serial primary key, name text not null,
   email text not null unique, company_id int not null references companies(id))\`.
3. Populate \`companies\` with the **distinct** companies from the raw table.
4. Populate \`people\` with every person, pointing at the right company.

Do not hardcode company names or ids — the graders run against the data, and
your script must work if a row is added.`,
          fixtures: `create table signups_raw (
  id serial primary key,
  person_name text not null,
  person_email text not null,
  company_name text not null,
  company_country text not null
);

insert into signups_raw (person_name, person_email, company_name, company_country) values
  ('Ada',   'ada@acme.test',    'Acme',      'GB'),
  ('Bob',   'bob@acme.test',    'Acme',      'GB'),
  ('Chen',  'chen@globex.test', 'Globex',    'US'),
  ('Dara',  'dara@acme.test',   'Acme',      'GB'),
  ('Elif',  'elif@initech.test','Initech',   'DE'),
  ('Farid', 'farid@globex.test','Globex',    'US');`,
          starter: `-- TODO: create companies, create people, then populate both from signups_raw

`,
          hints: [
            '`insert into companies (name, country) select distinct company_name, company_country from signups_raw;` — `distinct` applies across the whole selected row.',
            'For people, join back to the table you just filled: `insert into people (name, email, company_id) select r.person_name, r.person_email, c.id from signups_raw r join companies c on c.name = r.company_name;`',
            'Order matters: create both tables, insert companies, then insert people — the foreign key needs the company rows to exist first.',
            'Statements in one script run in order, so you can rely on the previous insert having happened.',
          ],
          solution: `create table companies (
  id serial primary key,
  name text not null unique,
  country text not null
);

create table people (
  id serial primary key,
  name text not null,
  email text not null unique,
  company_id int not null references companies(id)
);

-- One row per company, taken from the data itself.
insert into companies (name, country)
select distinct company_name, company_country
from signups_raw;

-- Join back to the table we just populated to resolve the foreign key.
insert into people (name, email, company_id)
select r.person_name, r.person_email, c.id
from signups_raw r
join companies c on c.name = r.company_name;
`,
          tests: `beforeEach(async () => { await execUser(); });

describe('the new tables', () => {
  it('creates companies and people', async () => {
    const tables = await q(
      "select table_name from information_schema.tables where table_schema='public' order by table_name",
    );
    expect(tables.map((r) => r.table_name)).toContain('companies');
    expect(tables.map((r) => r.table_name)).toContain('people');
  });

  it('keeps company names unique', async () => {
    await expect(q("insert into companies (name, country) values ('Acme', 'GB')"))
      .rejects.toThrow();
  });

  it('requires a real company on a person', async () => {
    await expect(q(
      "insert into people (name, email, company_id) values ('Ghost', 'g@x.test', 999)",
    )).rejects.toThrow();
  });
});

describe('the data moved correctly', () => {
  it('has one row per distinct company', async () => {
    const rows = await q('select name, country from companies order by name');
    expect(rows).toEqual([
      { name: 'Acme', country: 'GB' },
      { name: 'Globex', country: 'US' },
      { name: 'Initech', country: 'DE' },
    ]);
  });

  it('keeps every person', async () => {
    const rows = await q('select count(*)::int as c from people');
    expect(num(rows[0].c)).toBe(6);
  });

  it('links each person to the right company', async () => {
    const rows = await q(
      'select p.name as person, c.name as company, c.country ' +
      'from people p join companies c on c.id = p.company_id order by p.name',
    );
    expect(rows).toEqual([
      { person: 'Ada', company: 'Acme', country: 'GB' },
      { person: 'Bob', company: 'Acme', country: 'GB' },
      { person: 'Chen', company: 'Globex', country: 'US' },
      { person: 'Dara', company: 'Acme', country: 'GB' },
      { person: 'Elif', company: 'Initech', country: 'DE' },
      { person: 'Farid', company: 'Globex', country: 'US' },
    ]);
  });

  it('preserves emails exactly', async () => {
    const rows = await q('select email from people order by email');
    expect(rows.map((r) => r.email)).toEqual([
      'ada@acme.test', 'bob@acme.test', 'chen@globex.test',
      'dara@acme.test', 'elif@initech.test', 'farid@globex.test',
    ]);
  });

  it('leaves no person unmatched', async () => {
    const rows = await q(
      'select count(*)::int as c from people p ' +
      'left join companies c on c.id = p.company_id where c.id is null',
    );
    expect(num(rows[0].c)).toBe(0);
  });

  it('stores each company exactly once, not once per person', async () => {
    const rows = await q('select count(*)::int as c from companies');
    expect(num(rows[0].c)).toBe(3);
  });
});`,
        },
        {
          id: 'sql-migration',
          title: 'A migration that does not lock the table',
          kind: 'sql',
          xp: 90,
          why: 'The order of steps in a migration is the difference between a deploy and an outage.',
          tags: ['migrations', 'alter table', 'operations'],
          brief: `Adding a \`NOT NULL\` column to a populated table fails: the existing rows
have no value. The safe sequence is always **add nullable → backfill →
constrain**.

The fixture has \`accounts(id, email, created_at)\` with rows already in it.

## Task

Write a migration that, in order:

1. Adds \`plan text\` — nullable at first
2. Backfills every existing row to \`'free'\`
3. Makes \`plan\` \`not null\` with default \`'free'\`
4. Adds \`check (plan in ('free', 'pro', 'enterprise'))\`, named
   \`accounts_plan_valid\`
5. Adds \`last_seen_at timestamptz\` (nullable — genuinely unknown for old rows,
   and inventing a value would be a lie)
6. Adds a unique index named \`accounts_email_lower_idx\` on \`lower(email)\`, so
   \`Ada@x.com\` and \`ada@x.com\` cannot both exist

Do not drop or recreate the table: the existing rows and ids must survive.`,
          fixtures: `create table accounts (
  id serial primary key,
  email text not null,
  created_at timestamptz not null default now()
);

insert into accounts (email) values
  ('ada@example.com'),
  ('bob@example.com'),
  ('chen@example.com');`,
          starter: `-- TODO: add nullable, backfill, then constrain

`,
          hints: [
            '`alter table accounts add column plan text;` — no default yet, so no rewrite of existing rows.',
            '`update accounts set plan = \'free\' where plan is null;` is the backfill.',
            'Then two separate alters: `alter column plan set not null` and `alter column plan set default \'free\'`.',
            'A named constraint: `alter table accounts add constraint accounts_plan_valid check (plan in (...));`',
            '`create unique index accounts_email_lower_idx on accounts (lower(email));` — an expression index is how you enforce case-insensitive uniqueness.',
          ],
          solution: `-- 1. Nullable first: adding a NOT NULL column to existing rows would fail.
alter table accounts add column plan text;

-- 2. Backfill the rows that exist now.
update accounts set plan = 'free' where plan is null;

-- 3. Only now is the constraint satisfiable.
alter table accounts alter column plan set not null;
alter table accounts alter column plan set default 'free';

-- 4. Restrict the allowed values, with a name we can drop later.
alter table accounts add constraint accounts_plan_valid
  check (plan in ('free', 'pro', 'enterprise'));

-- 5. Honestly unknown for old rows, so it stays nullable.
alter table accounts add column last_seen_at timestamptz;

-- 6. Case-insensitive uniqueness needs an expression index.
create unique index accounts_email_lower_idx on accounts (lower(email));
`,
          tests: `beforeEach(async () => { await execUser(); });

describe('the columns', () => {
  it('adds plan as not null with a default', async () => {
    const rows = await q(
      "select is_nullable, column_default, data_type from information_schema.columns " +
      "where table_name = 'accounts' and column_name = 'plan'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('NO');
    expect(String(rows[0].column_default)).toContain('free');
    expect(rows[0].data_type).toBe('text');
  });

  it('adds last_seen_at as nullable', async () => {
    const rows = await q(
      "select is_nullable, data_type from information_schema.columns " +
      "where table_name = 'accounts' and column_name = 'last_seen_at'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('YES');
    expect(rows[0].data_type).toBe('timestamp with time zone');
  });
});

describe('the existing data survived', () => {
  it('keeps all three rows with their ids', async () => {
    const rows = await q('select id, email from accounts order by id');
    expect(rows.map((r) => num(r.id))).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.email)).toEqual([
      'ada@example.com', 'bob@example.com', 'chen@example.com',
    ]);
  });

  it('backfilled every row to free', async () => {
    const rows = await q('select distinct plan from accounts');
    expect(rows).toEqual([{ plan: 'free' }]);
  });

  it('kept created_at', async () => {
    const rows = await q('select count(*)::int as c from accounts where created_at is not null');
    expect(num(rows[0].c)).toBe(3);
  });
});

describe('the new rules', () => {
  it('applies the default to new rows', async () => {
    const rows = await q(
      "insert into accounts (email) values ('new@example.com') returning plan",
    );
    expect(rows[0].plan).toBe('free');
  });

  it('accepts the allowed plans', async () => {
    for (const plan of ['free', 'pro', 'enterprise']) {
      const rows = await q(
        "insert into accounts (email, plan) values ('" + plan + "@x.com', '" + plan + "') returning plan",
      );
      expect(rows[0].plan).toBe(plan);
    }
  });

  it('rejects an unknown plan', async () => {
    await expect(q("insert into accounts (email, plan) values ('x@x.com', 'platinum')"))
      .rejects.toThrow();
  });

  it('rejects a null plan explicitly', async () => {
    await expect(q("insert into accounts (email, plan) values ('x@x.com', null)"))
      .rejects.toThrow();
  });

  it('names the check constraint', async () => {
    const rows = await q(
      "select conname from pg_constraint where conname = 'accounts_plan_valid'",
    );
    expect(rows).toHaveLength(1);
  });
});

describe('the case-insensitive email index', () => {
  it('exists with the right name and is unique', async () => {
    const rows = await q(
      "select indexname, indexdef from pg_indexes " +
      "where tablename = 'accounts' and indexname = 'accounts_email_lower_idx'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef.toLowerCase()).toContain('unique');
    expect(rows[0].indexdef.toLowerCase()).toContain('lower');
  });

  it('blocks a differently-cased duplicate', async () => {
    await expect(q("insert into accounts (email) values ('ADA@example.com')"))
      .rejects.toThrow();
  });

  it('still allows genuinely different emails', async () => {
    const rows = await q(
      "insert into accounts (email) values ('someone.else@example.com') returning id",
    );
    expect(num(rows[0].id)).toBeGreaterThan(3);
  });
});`,
        },
        {
          id: 'sql-indexes',
          title: 'Indexes for the queries you actually run',
          kind: 'sql',
          xp: 85,
          why: 'Indexing every column is as wrong as indexing none. The index has to match the query.',
          tags: ['indexes', 'performance', 'ddl'],
          brief: `An index is a sorted copy of some columns. It helps when the query's
filter and ordering match the index's leading columns — and costs you on every
write. Three rules cover most of it:

- **Composite order matters.** An index on \`(a, b)\` serves \`where a = ?\` and
  \`where a = ? order by b\`, but not \`where b = ?\`.
- **Partial indexes** skip rows you never query, which is most of them when you
  only ever look at one status.
- **Expression indexes** are needed when you filter on a function of a column.

## Task

The application runs exactly these queries:

\`\`\`sql
-- A: a customer's orders, newest first
select * from orders where customer_id = $1 order by placed_at desc;

-- B: the pending queue, oldest first (pending is ~1% of rows)
select * from orders where status = 'pending' order by placed_at;

-- C: look up a customer by email regardless of case
select * from customers where lower(email) = lower($1);
\`\`\`

Create exactly three indexes, named and shaped to serve them:

1. \`orders_customer_placed_idx\` — composite, on \`orders\`, supporting A
   including its ordering
2. \`orders_pending_idx\` — a **partial** index on \`orders\` for B
3. \`customers_email_lower_idx\` — a **unique** expression index on \`customers\`
   for C`,
          fixtures: SHOP,
          starter: `-- TODO: three indexes, matching the three queries above

`,
          hints: [
            'For query A: `create index orders_customer_placed_idx on orders (customer_id, placed_at desc);` — the equality column comes first, the ordering column second.',
            'For query B, the filter is a constant, so bake it into the index: `create index orders_pending_idx on orders (placed_at) where status = \'pending\';` The index then contains only pending rows.',
            'For query C, index the expression you filter on: `create unique index customers_email_lower_idx on customers (lower(email));`',
            'You can confirm what Postgres chose with `explain select ...` — the tests do exactly that.',
          ],
          solution: `-- A: equality column first, then the column you order by.
create index orders_customer_placed_idx on orders (customer_id, placed_at desc);

-- B: pending is a tiny slice, so keep only those rows in the index.
create index orders_pending_idx on orders (placed_at) where status = 'pending';

-- C: filtering on lower(email) needs an index on lower(email).
create unique index customers_email_lower_idx on customers (lower(email));
`,
          tests: `beforeEach(async () => { await execUser(); });

const indexDef = async (name) => {
  const rows = await q('select indexdef from pg_indexes where indexname = $1', [name]);
  return rows.length ? rows[0].indexdef.toLowerCase() : null;
};

describe('the three indexes exist', () => {
  it('creates exactly the three requested indexes', async () => {
    const rows = await q(
      "select indexname from pg_indexes where schemaname = 'public' " +
      "and indexname not like '%_pkey' and indexname not like '%_key' order by indexname",
    );
    expect(rows.map((r) => r.indexname)).toEqual([
      'customers_email_lower_idx', 'orders_customer_placed_idx', 'orders_pending_idx',
    ]);
  });
});

describe('A: the composite index', () => {
  it('leads with customer_id and includes placed_at', async () => {
    const def = await indexDef('orders_customer_placed_idx');
    expect(def).toBeTruthy();
    expect(def).toContain('on public.orders');
    const columns = def.slice(def.indexOf('(') + 1, def.lastIndexOf(')'));
    expect(columns.indexOf('customer_id')).toBeLessThan(columns.indexOf('placed_at'));
  });

  it('is used for a customer lookup', async () => {
    const plan = await q('explain select * from orders where customer_id = 1 order by placed_at desc');
    const text = plan.map((r) => Object.values(r)[0]).join('\\n');
    expect(text.toLowerCase()).toContain('orders_customer_placed_idx');
  });
});

describe('B: the partial index', () => {
  it('is partial on status = pending', async () => {
    const def = await indexDef('orders_pending_idx');
    expect(def).toBeTruthy();
    expect(def).toContain('where');
    expect(def).toContain('pending');
  });

  it('indexes placed_at so the queue can be ordered', async () => {
    const def = await indexDef('orders_pending_idx');
    expect(def).toContain('placed_at');
  });

  it('is smaller than the table because it skips non-pending rows', async () => {
    // A partial index on this fixture covers 2 of 10 orders.
    const rows = await q("select count(*)::int as c from orders where status = 'pending'");
    expect(num(rows[0].c)).toBe(2);
  });
});

describe('C: the expression index', () => {
  it('is a unique index on lower(email)', async () => {
    const def = await indexDef('customers_email_lower_idx');
    expect(def).toBeTruthy();
    expect(def).toContain('unique');
    expect(def).toContain('lower');
  });

  it('enforces case-insensitive uniqueness', async () => {
    await expect(q(
      "insert into customers (name, email, country, created_at) " +
      "values ('Fake Ada', 'ADA@example.com', 'GB', '2024-03-01')",
    )).rejects.toThrow();
  });

  it('is used for a case-insensitive lookup', async () => {
    await q('analyze customers');
    const plan = await q(
      "explain select * from customers where lower(email) = lower('ADA@example.com')",
    );
    const text = plan.map((r) => Object.values(r)[0]).join('\\n').toLowerCase();
    expect(text).toContain('customers_email_lower_idx');
  });
});`,
        },
      ],
    },

    /* ================================================================== */
    {
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
          brief: `An inner join drops rows with no match — which is exactly wrong when the
absence *is* the question. A left join keeps them, with \`NULL\` on the right.

The fixture is the shop schema: \`customers\`, \`orders\`, \`order_items\`.

## Task

Write **one** query returning every customer, whether or not they have ordered:

| column | meaning |
| --- | --- |
| \`name\` | the customer's name |
| \`country\` | their country |
| \`order_count\` | number of **paid** orders (0, not null, when none) |
| \`paid_cents\` | total \`total_cents\` of their paid orders (0 when none) |

Order by \`paid_cents\` descending, then \`name\` ascending. Every one of the six
customers must appear.

Only orders with \`status = 'paid'\` count — and note where that condition has to
go so it does not silently turn your left join into an inner one.`,
          fixtures: SHOP,
          starter: `-- TODO: one query, six rows
select
from customers c
`,
          hints: [
            'Start from `customers` and `left join orders`, so customers with no orders survive.',
            'The status filter must be part of the join condition (`on o.customer_id = c.id and o.status = \'paid\'`) — putting it in `where` removes the null rows and makes the left join behave like an inner join.',
            '`count(o.id)` counts non-null values, so it is naturally 0 for an unmatched customer. `count(*)` would return 1.',
            'For the sum, `coalesce(sum(o.total_cents), 0)` — `sum` over no rows is null, not 0.',
            'Group by the customer columns you select: `group by c.id, c.name, c.country`.',
          ],
          solution: `select
  c.name,
  c.country,
  count(o.id)::int as order_count,
  coalesce(sum(o.total_cents), 0)::int as paid_cents
from customers c
-- The status filter belongs in the JOIN, not the WHERE: in the WHERE it would
-- discard the null rows and quietly become an inner join.
left join orders o on o.customer_id = c.id and o.status = 'paid'
group by c.id, c.name, c.country
order by paid_cents desc, c.name asc;
`,
          tests: `describe('the result set', () => {
  it('includes every customer, even those with no paid orders', async () => {
    const rows = await queryUser();
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.name).sort()).toEqual(['Ada', 'Bob', 'Chen', 'Dara', 'Elif', 'Farid']);
  });

  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['country', 'name', 'order_count', 'paid_cents']);
  });

  it('counts and sums only paid orders', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

    // Ada: 12000 + 4500 paid, plus a cancelled 9900 that must not count.
    expect(num(byName.Ada.order_count)).toBe(2);
    expect(num(byName.Ada.paid_cents)).toBe(16500);

    // Bob: one paid 31000, plus a pending 2500.
    expect(num(byName.Bob.order_count)).toBe(1);
    expect(num(byName.Bob.paid_cents)).toBe(31000);

    // Chen: 7800 + 15000 paid, plus a refunded 3300.
    expect(num(byName.Chen.order_count)).toBe(2);
    expect(num(byName.Chen.paid_cents)).toBe(22800);

    expect(num(byName.Dara.order_count)).toBe(1);
    expect(num(byName.Dara.paid_cents)).toBe(990);
  });

  it('reports zero, not null, for customers with no paid orders', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

    // Elif has only a pending order; Farid has none at all.
    expect(num(byName.Elif.order_count)).toBe(0);
    expect(num(byName.Elif.paid_cents)).toBe(0);
    expect(num(byName.Farid.order_count)).toBe(0);
    expect(num(byName.Farid.paid_cents)).toBe(0);
  });

  it('carries the country through', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.Ada.country).toBe('GB');
    expect(byName.Chen.country).toBe('US');
    expect(byName.Elif.country).toBe('DE');
  });

  it('orders by paid_cents desc, then name', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.name)).toEqual(['Bob', 'Chen', 'Ada', 'Dara', 'Elif', 'Farid']);
  });
});`,
        },
        {
          id: 'sql-aggregates',
          title: 'Aggregates, HAVING and FILTER',
          kind: 'sql',
          xp: 80,
          why: 'Reporting queries are most of the SQL a product engineer writes, and `FILTER` replaces a pile of CASE expressions.',
          tags: ['group by', 'having', 'aggregates'],
          brief: `\`WHERE\` filters rows before grouping; \`HAVING\` filters groups after.
And when you need several differently-filtered aggregates in one pass,
\`count(*) filter (where ...)\` is cleaner than \`sum(case when ... then 1 end)\`.

## Task

One query, grouped by country, reporting per country:

| column | meaning |
| --- | --- |
| \`country\` | |
| \`customers\` | number of customers |
| \`paid_orders\` | number of orders with status \`paid\` |
| \`pending_orders\` | number with status \`pending\` |
| \`paid_cents\` | total cents of paid orders (0 if none) |
| \`avg_paid_cents\` | average paid order value, rounded to a whole integer (0 if none) |

Include only countries with **at least two** customers. Order by
\`paid_cents\` descending.`,
          fixtures: SHOP,
          starter: `-- TODO
select
from customers c
`,
          hints: [
            'Join customers to orders with a left join so a country with no orders still counts its customers.',
            '`count(distinct c.id)` for the customer count — a plain `count` would multiply by the number of orders each customer has.',
            "Per-status counts in one pass: `count(*) filter (where o.status = 'paid')`. Note `count(o.id) filter (...)` is safer with left joins, since `count(*)` counts the null row too.",
            'Averages: `coalesce(round(avg(o.total_cents) filter (where o.status = \'paid\')), 0)::int` — `round` on a numeric average, then cast.',
            '`having count(distinct c.id) >= 2` filters the groups. `where` cannot see an aggregate.',
          ],
          solution: `select
  c.country,
  count(distinct c.id)::int as customers,
  count(o.id) filter (where o.status = 'paid')::int as paid_orders,
  count(o.id) filter (where o.status = 'pending')::int as pending_orders,
  coalesce(sum(o.total_cents) filter (where o.status = 'paid'), 0)::int as paid_cents,
  coalesce(round(avg(o.total_cents) filter (where o.status = 'paid')), 0)::int as avg_paid_cents
from customers c
left join orders o on o.customer_id = c.id
group by c.country
having count(distinct c.id) >= 2
order by paid_cents desc;
`,
          tests: `describe('grouping', () => {
  it('returns one row per qualifying country', async () => {
    const rows = await queryUser();
    // GB (Ada, Dara), US (Bob, Chen), DE (Elif, Farid) all have 2 customers.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.country).sort()).toEqual(['DE', 'GB', 'US']);
  });

  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual([
      'avg_paid_cents', 'country', 'customers', 'paid_cents', 'paid_orders', 'pending_orders',
    ]);
  });

  it('counts customers without multiplying by their orders', async () => {
    const rows = await queryUser();
    for (const row of rows) expect(num(row.customers)).toBe(2);
  });
});

describe('the aggregates', () => {
  it('counts paid and pending orders separately', async () => {
    const rows = await queryUser();
    const byCountry = Object.fromEntries(rows.map((r) => [r.country, r]));

    // US: Bob 1 paid + 1 pending, Chen 2 paid + 1 refunded.
    expect(num(byCountry.US.paid_orders)).toBe(3);
    expect(num(byCountry.US.pending_orders)).toBe(1);

    // GB: Ada 2 paid + 1 cancelled, Dara 1 paid.
    expect(num(byCountry.GB.paid_orders)).toBe(3);
    expect(num(byCountry.GB.pending_orders)).toBe(0);

    // DE: Elif 1 pending, Farid nothing.
    expect(num(byCountry.DE.paid_orders)).toBe(0);
    expect(num(byCountry.DE.pending_orders)).toBe(1);
  });

  it('sums only paid orders', async () => {
    const rows = await queryUser();
    const byCountry = Object.fromEntries(rows.map((r) => [r.country, r]));
    expect(num(byCountry.US.paid_cents)).toBe(31000 + 7800 + 15000);
    expect(num(byCountry.GB.paid_cents)).toBe(12000 + 4500 + 990);
    expect(num(byCountry.DE.paid_cents)).toBe(0);
  });

  it('averages paid orders, rounded', async () => {
    const rows = await queryUser();
    const byCountry = Object.fromEntries(rows.map((r) => [r.country, r]));
    expect(num(byCountry.US.avg_paid_cents)).toBe(Math.round((31000 + 7800 + 15000) / 3));
    expect(num(byCountry.GB.avg_paid_cents)).toBe(Math.round((12000 + 4500 + 990) / 3));
  });

  it('reports 0 rather than null where there is nothing to average', async () => {
    const rows = await queryUser();
    const de = rows.find((r) => r.country === 'DE');
    expect(num(de.paid_cents)).toBe(0);
    expect(num(de.avg_paid_cents)).toBe(0);
  });

  it('orders by paid_cents descending', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.country)).toEqual(['US', 'GB', 'DE']);
  });
});

describe('HAVING', () => {
  it('excludes a country with only one customer', async () => {
    await q(
      "insert into customers (name, email, country, created_at) " +
      "values ('Solo', 'solo@example.com', 'FR', '2024-03-01')",
    );
    const rows = await q(userSql);
    expect(rows.map((r) => r.country)).not.toContain('FR');
  });

  it('includes it once it has two customers', async () => {
    await q(
      "insert into customers (name, email, country, created_at) values " +
      "('Solo', 'solo@example.com', 'FR', '2024-03-01'), " +
      "('Duo', 'duo@example.com', 'FR', '2024-03-02')",
    );
    const rows = await q(userSql);
    expect(rows.map((r) => r.country)).toContain('FR');
  });
});`,
        },
        {
          id: 'sql-windows',
          title: 'Window functions',
          kind: 'sql',
          xp: 95,
          why: '"Top 3 per group" and "running total" are impossible with GROUP BY alone and trivial with a window.',
          tags: ['window functions', 'ranking', 'analytics'],
          brief: `A window function computes across a set of rows **without collapsing
them**. \`GROUP BY\` gives you one row per group; a window gives you every row,
each with its group's aggregate alongside.

\`\`\`sql
sum(total_cents) over (partition by customer_id order by placed_at)
\`\`\`

That is a running total per customer, in date order.

## Task

One query over paid orders only, returning every paid order with:

| column | meaning |
| --- | --- |
| \`customer_name\` | |
| \`placed_at\` | |
| \`total_cents\` | |
| \`order_seq\` | 1, 2, 3… per customer, oldest first |
| \`running_cents\` | running total of that customer's paid orders up to and including this one |
| \`customer_total_cents\` | that customer's paid total across all their orders |
| \`overall_rank\` | rank of this order by \`total_cents\` descending across the whole result (ties share a rank) |

Order by \`customer_name\`, then \`placed_at\`.`,
          fixtures: SHOP,
          starter: `-- TODO
select
from orders o
join customers c on c.id = o.customer_id
where o.status = 'paid'
`,
          hints: [
            '`row_number() over (partition by o.customer_id order by o.placed_at)` gives the per-customer sequence.',
            'A running total is the same partition plus an `order by`: `sum(o.total_cents) over (partition by o.customer_id order by o.placed_at)`. Adding `order by` inside `over` changes the frame from "the whole partition" to "everything up to this row".',
            'For the customer total, use the same partition with **no** `order by` — that frame is the entire partition.',
            '`rank() over (order by o.total_cents desc)` ranks across all rows and shares a rank for ties; `row_number` would break ties arbitrarily and `dense_rank` would not leave gaps.',
            'The `where status = \'paid\'` runs before the windows, so the windows only see paid orders — which is what you want here.',
          ],
          solution: `select
  c.name as customer_name,
  o.placed_at,
  o.total_cents,
  row_number() over (partition by o.customer_id order by o.placed_at)::int as order_seq,
  -- ORDER BY inside OVER makes the frame "everything up to this row".
  sum(o.total_cents) over (partition by o.customer_id order by o.placed_at)::int as running_cents,
  -- No ORDER BY: the frame is the whole partition.
  sum(o.total_cents) over (partition by o.customer_id)::int as customer_total_cents,
  rank() over (order by o.total_cents desc)::int as overall_rank
from orders o
join customers c on c.id = o.customer_id
where o.status = 'paid'
order by c.name, o.placed_at;
`,
          tests: `describe('shape', () => {
  it('returns one row per paid order, not one per customer', async () => {
    const rows = await queryUser();
    expect(rows).toHaveLength(6);
  });

  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual([
      'customer_name', 'customer_total_cents', 'order_seq',
      'overall_rank', 'placed_at', 'running_cents', 'total_cents',
    ]);
  });

  it('is ordered by customer then date', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.customer_name)).toEqual(['Ada', 'Ada', 'Bob', 'Chen', 'Chen', 'Dara']);
    expect(num(rows[0].total_cents)).toBe(12000);
    expect(num(rows[1].total_cents)).toBe(4500);
  });

  it('excludes non-paid orders', async () => {
    const rows = await queryUser();
    const totals = rows.map((r) => num(r.total_cents));
    expect(totals).not.toContain(9900);   // Ada, cancelled
    expect(totals).not.toContain(2500);   // Bob, pending
    expect(totals).not.toContain(3300);   // Chen, refunded
    expect(totals).not.toContain(45000);  // Elif, pending
  });
});

describe('per-customer windows', () => {
  it('numbers each customer\\'s orders from 1, oldest first', async () => {
    const rows = await queryUser();
    const ada = rows.filter((r) => r.customer_name === 'Ada');
    expect(ada.map((r) => num(r.order_seq))).toEqual([1, 2]);
    const chen = rows.filter((r) => r.customer_name === 'Chen');
    expect(chen.map((r) => num(r.order_seq))).toEqual([1, 2]);
    const dara = rows.filter((r) => r.customer_name === 'Dara');
    expect(dara.map((r) => num(r.order_seq))).toEqual([1]);
  });

  it('accumulates a running total in date order', async () => {
    const rows = await queryUser();
    const ada = rows.filter((r) => r.customer_name === 'Ada');
    expect(ada.map((r) => num(r.running_cents))).toEqual([12000, 16500]);
    const chen = rows.filter((r) => r.customer_name === 'Chen');
    expect(chen.map((r) => num(r.running_cents))).toEqual([7800, 22800]);
  });

  it('repeats the customer total on every one of their rows', async () => {
    const rows = await queryUser();
    const ada = rows.filter((r) => r.customer_name === 'Ada');
    expect(ada.map((r) => num(r.customer_total_cents))).toEqual([16500, 16500]);
    const chen = rows.filter((r) => r.customer_name === 'Chen');
    expect(chen.map((r) => num(r.customer_total_cents))).toEqual([22800, 22800]);
  });

  it('running total ends at the customer total', async () => {
    const rows = await queryUser();
    for (const name of ['Ada', 'Bob', 'Chen', 'Dara']) {
      const own = rows.filter((r) => r.customer_name === name);
      const last = own[own.length - 1];
      expect(num(last.running_cents)).toBe(num(last.customer_total_cents));
    }
  });
});

describe('the global rank', () => {
  it('ranks by order value descending across every row', async () => {
    const rows = await queryUser();
    const byTotal = [...rows].sort((a, b) => num(b.total_cents) - num(a.total_cents));
    // 31000, 15000, 12000, 7800, 4500, 990
    expect(byTotal.map((r) => num(r.overall_rank))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(num(byTotal[0].total_cents)).toBe(31000);
    expect(byTotal[0].customer_name).toBe('Bob');
  });

  it('shares a rank for ties', async () => {
    // Give two customers an identical paid order and check they rank together.
    await q("insert into orders (customer_id, status, total_cents, placed_at) values " +
            "(4, 'paid', 50000, '2024-03-01'), (5, 'paid', 50000, '2024-03-02')");
    const rows = await q(userSql);
    const top = rows.filter((r) => num(r.total_cents) === 50000);
    expect(top).toHaveLength(2);
    expect(top.every((r) => num(r.overall_rank) === 1)).toBe(true);
    // rank() leaves a gap: the next value is rank 3.
    const next = rows.find((r) => num(r.total_cents) === 31000);
    expect(num(next.overall_rank)).toBe(3);
  });
});`,
        },
        {
          id: 'sql-recursive-cte',
          title: 'Recursive CTEs for trees',
          kind: 'sql',
          xp: 95,
          why: 'Category trees, org charts, comment threads, permission inheritance — all the same query shape.',
          tags: ['cte', 'recursion', 'hierarchies'],
          brief: `A self-referencing table (\`parent_id\`) needs recursion to walk. Doing it
in application code is N+1 queries deep; doing it in SQL is one.

\`\`\`sql
with recursive t as (
  select ... -- the anchor: where to start
  union all
  select ... from table join t on ...  -- the step, referring to t itself
)
select * from t;
\`\`\`

## Task

\`categories(id, name, parent_id)\` is a tree. Write one query returning every
category with:

| column | meaning |
| --- | --- |
| \`id\` | |
| \`name\` | |
| \`depth\` | 0 for roots, 1 for their children, and so on |
| \`path\` | names from the root joined with \` > \`, e.g. \`Tech > Laptops > Gaming\` |
| \`root_name\` | the name of the top-level ancestor |

Order by \`path\`.`,
          fixtures: `create table categories (
  id serial primary key,
  name text not null,
  parent_id int references categories(id)
);

insert into categories (id, name, parent_id) values
  (1, 'Tech',      null),
  (2, 'Laptops',   1),
  (3, 'Gaming',    2),
  (4, 'Ultrabook', 2),
  (5, 'Phones',    1),
  (6, 'Home',      null),
  (7, 'Kitchen',   6),
  (8, 'Blenders',  7),
  (9, 'Garden',    6);
select setval('categories_id_seq', 9);`,
          starter: `-- TODO
with recursive tree as (
  -- anchor: the roots
  select
  -- union all
  -- step: children of whatever is already in tree
)
select * from tree
`,
          hints: [
            'The anchor selects the roots: `where parent_id is null`, with `0 as depth`, `name as path`, `name as root_name`.',
            'The recursive step joins the table to the CTE: `from categories c join tree t on c.parent_id = t.id`, with `t.depth + 1` and `t.path || \' > \' || c.name`.',
            'Both halves of the `union all` must have the same columns, in the same order, with compatible types.',
            '`root_name` just carries through unchanged in the recursive part: `t.root_name`.',
            'Cast the depth if the types disagree between branches — `0` is an integer literal, and `t.depth + 1` stays an integer, so this usually just works.',
          ],
          solution: `with recursive tree as (
  -- Anchor: every root, at depth 0, its path being just its own name.
  select
    c.id,
    c.name,
    0 as depth,
    c.name as path,
    c.name as root_name
  from categories c
  where c.parent_id is null

  union all

  -- Step: children of anything already in the tree.
  select
    c.id,
    c.name,
    t.depth + 1 as depth,
    t.path || ' > ' || c.name as path,
    t.root_name
  from categories c
  join tree t on c.parent_id = t.id
)
select id, name, depth::int as depth, path, root_name
from tree
order by path;
`,
          tests: `describe('coverage', () => {
  it('returns every category exactly once', async () => {
    const rows = await queryUser();
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => num(r.id)).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['depth', 'id', 'name', 'path', 'root_name']);
  });
});

describe('depth', () => {
  it('puts roots at 0', async () => {
    const rows = await queryUser();
    const roots = rows.filter((r) => num(r.depth) === 0).map((r) => r.name).sort();
    expect(roots).toEqual(['Home', 'Tech']);
  });

  it('counts levels correctly', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(num(byName.Tech.depth)).toBe(0);
    expect(num(byName.Laptops.depth)).toBe(1);
    expect(num(byName.Gaming.depth)).toBe(2);
    expect(num(byName.Blenders.depth)).toBe(2);
    expect(num(byName.Kitchen.depth)).toBe(1);
  });
});

describe('path', () => {
  it('builds a breadcrumb from the root', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.Tech.path).toBe('Tech');
    expect(byName.Laptops.path).toBe('Tech > Laptops');
    expect(byName.Gaming.path).toBe('Tech > Laptops > Gaming');
    expect(byName.Blenders.path).toBe('Home > Kitchen > Blenders');
  });

  it('orders by path', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.path)).toEqual([
      'Home',
      'Home > Garden',
      'Home > Kitchen',
      'Home > Kitchen > Blenders',
      'Tech',
      'Tech > Laptops',
      'Tech > Laptops > Gaming',
      'Tech > Laptops > Ultrabook',
      'Tech > Phones',
    ]);
  });
});

describe('root_name', () => {
  it('carries the top-level ancestor down every branch', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.Gaming.root_name).toBe('Tech');
    expect(byName.Blenders.root_name).toBe('Home');
    expect(byName.Tech.root_name).toBe('Tech');
    expect(byName.Garden.root_name).toBe('Home');
  });
});

describe('it really recurses', () => {
  it('handles a branch four levels deep added after the fact', async () => {
    await q("insert into categories (name, parent_id) values ('RGB', 3)");
    const rows = await q(userSql);
    const rgb = rows.find((r) => r.name === 'RGB');
    expect(rgb).toBeTruthy();
    expect(num(rgb.depth)).toBe(3);
    expect(rgb.path).toBe('Tech > Laptops > Gaming > RGB');
    expect(rgb.root_name).toBe('Tech');
    expect(rows).toHaveLength(10);
  });

  it('handles a brand new root', async () => {
    await q("insert into categories (name, parent_id) values ('Auto', null)");
    const rows = await q(userSql);
    const auto = rows.find((r) => r.name === 'Auto');
    expect(num(auto.depth)).toBe(0);
    expect(auto.path).toBe('Auto');
    expect(auto.root_name).toBe('Auto');
  });
});`,
        },
        {
          id: 'sql-upsert',
          title: 'Upserts without a race condition',
          kind: 'sql',
          xp: 85,
          why: '"Check if it exists, then insert or update" is a race condition. `ON CONFLICT` is the fix, in one statement.',
          tags: ['upsert', 'concurrency', 'constraints'],
          brief: `\`SELECT\` then \`INSERT\` has a gap: two requests can both see "not there"
and both insert. \`INSERT ... ON CONFLICT\` closes the gap by making the
database decide, atomically, against a unique constraint.

The fixture has \`page_views(page text primary key, views int not null,
last_seen timestamptz not null)\` with two rows.

## Task

Write **one statement** that records a view of the page \`'/pricing'\`:

- if the page is new, insert it with \`views = 1\` and \`last_seen = now()\`
- if it exists, add 1 to its existing \`views\` and set \`last_seen = now()\`
- return the page and its new \`views\` count

Use \`excluded\` to refer to the row you proposed, and make the increment work
from the **stored** value — not from a value you computed in the application.`,
          fixtures: `create table page_views (
  page text primary key,
  views int not null,
  last_seen timestamptz not null
);

insert into page_views (page, views, last_seen) values
  ('/', 10, now() - interval '1 day'),
  ('/pricing', 3, now() - interval '2 hours');`,
          starter: `-- TODO: one statement, no SELECT first
insert into page_views (page, views, last_seen)
`,
          hints: [
            'The skeleton: `insert into page_views (page, views, last_seen) values (\'/pricing\', 1, now()) on conflict (page) do update set ...`',
            '`excluded` is the row you tried to insert. So `set last_seen = excluded.last_seen` reuses the `now()` you already wrote.',
            'For the count, read the stored row: `views = page_views.views + 1`. Qualifying it with the table name is what distinguishes the existing value from `excluded.views`.',
            'Add `returning page, views` to get the result back without a second query.',
            'The conflict target `(page)` must match a unique constraint or primary key — that is what makes the operation atomic.',
          ],
          solution: `insert into page_views (page, views, last_seen)
values ('/pricing', 1, now())
on conflict (page) do update
  -- page_views.views is the stored value; excluded.* is the row we proposed.
  set views = page_views.views + 1,
      last_seen = excluded.last_seen
returning page, views;
`,
          tests: `describe('updating an existing page', () => {
  it('returns the page and its new count', async () => {
    const rows = await queryUser();
    expect(rows).toHaveLength(1);
    expect(rows[0].page).toBe('/pricing');
    expect(num(rows[0].views)).toBe(4);
  });

  it('increments from the stored value rather than replacing it', async () => {
    await execUser();
    const rows = await q("select views from page_views where page = '/pricing'");
    expect(num(rows[0].views)).toBe(4);
  });

  it('refreshes last_seen', async () => {
    await execUser();
    const rows = await q(
      "select (last_seen > now() - interval '1 minute') as fresh from page_views where page = '/pricing'",
    );
    expect(rows[0].fresh).toBe(true);
  });

  it('leaves other pages alone', async () => {
    await execUser();
    const rows = await q("select views from page_views where page = '/'");
    expect(num(rows[0].views)).toBe(10);
  });

  it('adds no new row', async () => {
    await execUser();
    const rows = await q('select count(*)::int as c from page_views');
    expect(num(rows[0].c)).toBe(2);
  });
});

describe('inserting a new page', () => {
  it('creates the row with views = 1 when it does not exist', async () => {
    await q("delete from page_views where page = '/pricing'");
    const rows = await q(userSql);
    expect(rows[0].page).toBe('/pricing');
    expect(num(rows[0].views)).toBe(1);

    const stored = await q("select views from page_views where page = '/pricing'");
    expect(num(stored[0].views)).toBe(1);
  });

  it('sets last_seen on insert too', async () => {
    await q("delete from page_views where page = '/pricing'");
    await q(userSql);
    const rows = await q(
      "select (last_seen > now() - interval '1 minute') as fresh from page_views where page = '/pricing'",
    );
    expect(rows[0].fresh).toBe(true);
  });
});

describe('it is genuinely idempotent-safe under repetition', () => {
  it('counts every call exactly once', async () => {
    await q("delete from page_views where page = '/pricing'");
    for (let i = 0; i < 5; i++) await q(userSql);
    const rows = await q("select views from page_views where page = '/pricing'");
    expect(num(rows[0].views)).toBe(5);
  });

  it('never errors on a duplicate key', async () => {
    for (let i = 0; i < 3; i++) {
      const rows = await q(userSql);
      expect(rows).toHaveLength(1);
    }
  });

  it('is a single statement, with no SELECT first', async () => {
    const normalised = userSql.toLowerCase();
    expect(normalised).toContain('on conflict');
    expect(normalised).toContain('excluded');
    // A leading SELECT would mean the read-then-write race is still there.
    expect(normalised.trimStart().startsWith('insert')).toBe(true);
  });
});`,
        },
      ],
    },

    /* ================================================================== */
    {
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
          brief: `A transaction gives you atomicity — all or nothing. It does **not**
automatically give you protection from concurrent writers; that depends on the
isolation level and on how you write the query.`,
          quiz: [
            {
              q: 'Two requests both run `SELECT balance FROM accounts WHERE id = 1` (getting 100), then each writes `UPDATE accounts SET balance = 90`. Both are inside `BEGIN`/`COMMIT` at the default isolation level. What is the final balance?',
              options: ['80, because both deductions apply', '90 — one update is lost', 'The second transaction fails with a serialisation error', '100, both roll back'],
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
          brief: `The N+1: fetch 50 customers, then loop and fetch each one's orders. 51
round trips, each with its own latency. The endpoint is slow and the database
looks fine, because every individual query is fast.

The fix is to ask for everything once, and let Postgres nest the results.

## Task

One query returning one row per customer who has at least one paid order:

| column | meaning |
| --- | --- |
| \`name\` | |
| \`order_count\` | how many paid orders they have |
| \`recent_orders\` | a **JSON array** of their up-to-3 most recent paid orders, newest first, each \`{"id": …, "total_cents": …, "placed_at": "YYYY-MM-DD"}\` |

Order by \`name\`. The JSON array must be a real JSON array (use
\`json_agg\`/\`jsonb_agg\`), not a string you assembled by hand.

The "3 most recent per customer" part is the interesting bit: a plain
\`json_agg\` would take all of them. A \`LATERAL\` join, or a window function in a
subquery, gets you the per-group limit.`,
          fixtures: SHOP,
          starter: `-- TODO: one query, no loop in the application
select
from customers c
`,
          hints: [
            'Two things are being computed at different grains: the total count over all paid orders, and a list limited to 3. Do the count with a normal aggregate and the list with a per-customer subquery.',
            '`LATERAL` lets a subquery reference the row on its left: `left join lateral (select ... from orders o where o.customer_id = c.id and o.status = \'paid\' order by o.placed_at desc limit 3) recent on true`.',
            'Then `json_agg(...)` over the lateral rows. Alternatively, in a CTE add `row_number() over (partition by customer_id order by placed_at desc)` and filter `<= 3`.',
            'Format the date to match: `to_char(o.placed_at, \'YYYY-MM-DD\')`, since a raw date would serialise with a timestamp.',
            'Build each element with `json_build_object(\'id\', o.id, \'total_cents\', o.total_cents, \'placed_at\', to_char(...))`.',
            'Keep the ordering inside the aggregate: `json_agg(x order by ...)` — the order of rows going into an aggregate is not otherwise guaranteed.',
          ],
          solution: `with paid as (
  select
    o.*,
    row_number() over (partition by o.customer_id order by o.placed_at desc) as recency
  from orders o
  where o.status = 'paid'
)
select
  c.name,
  count(p.id)::int as order_count,
  -- Only the three newest go into the array; the count above still sees them all.
  coalesce(
    json_agg(
      json_build_object(
        'id', p.id,
        'total_cents', p.total_cents,
        'placed_at', to_char(p.placed_at, 'YYYY-MM-DD')
      )
      order by p.placed_at desc
    ) filter (where p.recency <= 3),
    '[]'::json
  ) as recent_orders
from customers c
join paid p on p.customer_id = c.id
group by c.id, c.name
order by c.name;
`,
          tests: `describe('shape', () => {
  it('returns one row per customer with paid orders', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.name)).toEqual(['Ada', 'Bob', 'Chen', 'Dara']);
  });

  it('excludes customers with no paid orders', async () => {
    const rows = await queryUser();
    const names = rows.map((r) => r.name);
    expect(names).not.toContain('Elif');
    expect(names).not.toContain('Farid');
  });

  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['name', 'order_count', 'recent_orders']);
  });
});

describe('order_count', () => {
  it('counts paid orders only', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(num(byName.Ada.order_count)).toBe(2);
    expect(num(byName.Bob.order_count)).toBe(1);
    expect(num(byName.Chen.order_count)).toBe(2);
    expect(num(byName.Dara.order_count)).toBe(1);
  });
});

describe('recent_orders', () => {
  it('is a real JSON array of objects', async () => {
    const rows = await queryUser();
    const value = rows[0].recent_orders;
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    expect(Array.isArray(parsed)).toBe(true);
    expect(typeof parsed[0]).toBe('object');
    expect(Object.keys(parsed[0]).sort()).toEqual(['id', 'placed_at', 'total_cents']);
  });

  it('lists a customer\\'s paid orders newest first', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

    const ada = parse(byName.Ada.recent_orders);
    expect(ada.map((o) => o.placed_at)).toEqual(['2024-01-28', '2024-01-03']);
    expect(ada.map((o) => num(o.total_cents))).toEqual([4500, 12000]);

    const chen = parse(byName.Chen.recent_orders);
    expect(chen.map((o) => o.placed_at)).toEqual(['2024-02-21', '2024-02-06']);
  });

  it('formats the date as YYYY-MM-DD', async () => {
    const rows = await queryUser();
    const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
    for (const row of rows) {
      for (const order of parse(row.recent_orders)) {
        expect(order.placed_at).toMatch(/^\\d{4}-\\d{2}-\\d{2}$/);
      }
    }
  });

  it('excludes non-paid orders from the array', async () => {
    const rows = await queryUser();
    const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
    const all = rows.flatMap((r) => parse(r.recent_orders)).map((o) => num(o.total_cents));
    expect(all).not.toContain(9900);
    expect(all).not.toContain(3300);
    expect(all).not.toContain(2500);
  });

  it('caps the array at 3 while order_count keeps counting', async () => {
    await q("insert into orders (customer_id, status, total_cents, placed_at) values " +
            "(1, 'paid', 100, '2024-03-01'), " +
            "(1, 'paid', 200, '2024-03-02'), " +
            "(1, 'paid', 300, '2024-03-03')");
    const rows = await q(userSql);
    const ada = rows.find((r) => r.name === 'Ada');
    const parsed = typeof ada.recent_orders === 'string'
      ? JSON.parse(ada.recent_orders) : ada.recent_orders;

    expect(num(ada.order_count)).toBe(5);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((o) => o.placed_at)).toEqual(['2024-03-03', '2024-03-02', '2024-03-01']);
  });
});`,
        },
        {
          id: 'sql-keyset-pagination',
          title: 'Pagination that stays fast on page 900',
          kind: 'sql',
          xp: 85,
          why: '`OFFSET 20000` reads and throws away 20,000 rows. Every infinite scroll should be keyset-based.',
          tags: ['pagination', 'performance', 'indexes'],
          brief: `\`LIMIT 20 OFFSET 20000\` makes the database find 20,020 rows and discard
20,000 of them. It also skips or repeats rows when data is inserted between
requests.

**Keyset** (or cursor) pagination asks for "the next 20 after *this* row",
which an index can jump straight to.

The trick is the tie-break: ordering by a non-unique column needs a second,
unique column, and the comparison has to treat the pair as a tuple.

## Task

The fixture has \`events(id, occurred_at, kind)\`, with **deliberate duplicate
timestamps**.

Write one query returning the page of 3 events immediately **after** the cursor
\`(occurred_at = '2024-01-02 10:00:00+00', id = 4)\`, newest first.

- order by \`occurred_at\` descending, then \`id\` descending
- return \`id\`, \`occurred_at\`, \`kind\`
- exactly 3 rows, and no row from the cursor's page repeated
- use a **row-value comparison** — \`(a, b) < (x, y)\` — not \`OFFSET\`, and not
  \`occurred_at <= x AND id < y\` (which drops rows across a timestamp boundary)`,
          fixtures: `create table events (
  id serial primary key,
  occurred_at timestamptz not null,
  kind text not null
);

insert into events (id, occurred_at, kind) values
  (1, '2024-01-01 09:00:00+00', 'signup'),
  (2, '2024-01-01 09:00:00+00', 'login'),
  (3, '2024-01-02 10:00:00+00', 'purchase'),
  (4, '2024-01-02 10:00:00+00', 'refund'),
  (5, '2024-01-02 10:00:00+00', 'login'),
  (6, '2024-01-03 11:00:00+00', 'signup'),
  (7, '2024-01-03 11:00:00+00', 'login'),
  (8, '2024-01-04 12:00:00+00', 'purchase'),
  (9, '2024-01-05 13:00:00+00', 'login');
select setval('events_id_seq', 9);`,
          starter: `-- TODO: the 3 events after the cursor (occurred_at '2024-01-02 10:00:00+00', id 4)
select id, occurred_at, kind
from events
`,
          hints: [
            'Descending order means "after the cursor" is "less than the cursor": `where (occurred_at, id) < (timestamptz \'2024-01-02 10:00:00+00\', 4)`.',
            'Row-value comparison compares left to right: it only looks at `id` when `occurred_at` is equal, which is exactly the tie-break you want.',
            'Then `order by occurred_at desc, id desc limit 3` — the ORDER BY must match the comparison, or you will page through the wrong sequence.',
            'Cast the literal so the comparison is timestamp-to-timestamp: `timestamptz \'2024-01-02 10:00:00+00\'`.',
            'Sanity check the expected answer by hand: sorted descending, the rows are 9, 8, 7, 6, 5, 4, 3, 2, 1 — so after id 4 comes 3, then 2, then 1.',
          ],
          solution: `select id, occurred_at, kind
from events
-- Row-value comparison: only falls back to id when occurred_at ties, which is
-- what keeps a page from skipping or repeating rows on duplicate timestamps.
where (occurred_at, id) < (timestamptz '2024-01-02 10:00:00+00', 4)
order by occurred_at desc, id desc
limit 3;
`,
          tests: `describe('the page', () => {
  it('returns exactly 3 rows', async () => {
    const rows = await queryUser();
    expect(rows).toHaveLength(3);
  });

  it('returns the rows immediately after the cursor', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => num(r.id))).toEqual([3, 2, 1]);
  });

  it('includes the tied-timestamp row with a lower id', async () => {
    // id 3 shares the cursor's timestamp and must be included; ids 4 and 5 must not.
    const rows = await queryUser();
    const ids = rows.map((r) => num(r.id));
    expect(ids).toContain(3);
    expect(ids).not.toContain(4);
    expect(ids).not.toContain(5);
  });

  it('excludes everything newer than the cursor', async () => {
    const rows = await queryUser();
    const ids = rows.map((r) => num(r.id));
    for (const newer of [6, 7, 8, 9]) expect(ids).not.toContain(newer);
  });

  it('returns id, occurred_at and kind', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['id', 'kind', 'occurred_at']);
    expect(rows[0].kind).toBe('purchase');
  });

  it('is ordered newest first', async () => {
    const rows = await queryUser();
    const times = rows.map((r) => new Date(r.occurred_at).getTime());
    expect(times[0]).toBeGreaterThanOrEqual(times[1]);
    expect(times[1]).toBeGreaterThanOrEqual(times[2]);
  });
});

describe('the technique', () => {
  it('uses keyset pagination, not OFFSET', async () => {
    const normalised = userSql.toLowerCase();
    expect(normalised).not.toContain('offset');
  });

  it('survives a row being inserted before the page is fetched', async () => {
    // With OFFSET, inserting a newer row shifts the window and repeats a row.
    // With a keyset cursor, the page is unchanged.
    await q("insert into events (occurred_at, kind) values ('2024-01-06 09:00:00+00', 'signup')");
    const rows = await q(userSql);
    expect(rows.map((r) => num(r.id))).toEqual([3, 2, 1]);
  });

  it('does not lose rows across a timestamp boundary', async () => {
    // The naive "occurred_at <= x and id < y" form drops id 2 and 1 here,
    // because their ids are lower but their timestamp is older.
    const rows = await queryUser();
    expect(rows.map((r) => num(r.id))).toContain(2);
    expect(rows.map((r) => num(r.id))).toContain(1);
  });
});`,
        },
        {
          id: 'sql-analytics-boss',
          title: 'BOSS: the monthly revenue report',
          kind: 'sql',
          xp: 250,
          boss: true,
          why: 'The query someone asks you for in week two of a data-heavy team, using every tool from this track at once.',
          tags: ['cte', 'window functions', 'aggregates', 'reporting'],
          brief: `The track boss: one query, using CTEs, aggregates, a left join against a
generated month series, and window functions.

## Task

Produce a monthly revenue report covering **every month** from
\`2024-01\` to \`2024-03\` inclusive — including months with no revenue.

Count only orders with \`status = 'paid'\`.

| column | meaning |
| --- | --- |
| \`month\` | \`'YYYY-MM'\` |
| \`orders\` | paid orders that month (0 if none) |
| \`customers\` | distinct customers who ordered that month (0 if none) |
| \`revenue_cents\` | paid revenue that month (0 if none) |
| \`avg_order_cents\` | average paid order that month, rounded to an integer (0 if none) |
| \`running_revenue_cents\` | cumulative revenue from 2024-01 up to and including this month |
| \`prev_month_cents\` | previous month's revenue (0 for the first month) |
| \`growth_pct\` | percent change vs the previous month, rounded to 1 decimal. \`0\` when the previous month was 0 |

Order by \`month\` ascending.

Every month must appear even with no orders, so start from a generated series
of months and left join the data onto it — the classic reporting mistake is
starting from the orders table and silently dropping empty months.`,
          fixtures: SHOP,
          starter: `-- TODO: months series -> monthly aggregates -> window functions
with months as (
  select
)
select
`,
          hints: [
            "Generate the months: `select generate_series('2024-01-01'::date, '2024-03-01'::date, interval '1 month') as month_start`.",
            "Aggregate the orders by month in their own CTE: `select date_trunc('month', placed_at)::date as month_start, count(*) ... from orders where status = 'paid' group by 1`.",
            'Then `left join` the aggregates onto the months, so a month with no rows still appears — with nulls you coalesce to 0.',
            "Format with `to_char(m.month_start, 'YYYY-MM')`.",
            'The running total is a window over the joined result: `sum(coalesce(revenue, 0)) over (order by m.month_start)`. Coalesce *before* the window, or a null month breaks the accumulation.',
            "Previous month: `lag(coalesce(revenue, 0), 1, 0) over (order by m.month_start)`. The third argument to `lag` is the default for the first row, which saves a coalesce.",
            'Guard the division: `case when prev = 0 then 0 else round((current - prev) * 100.0 / prev, 1) end`. Multiply by `100.0`, not `100`, or integer division truncates.',
            'You will need the lag value in two places (the column and the growth calculation). Compute the windows in one CTE and do the arithmetic in an outer select — window functions cannot be nested inside each other.',
          ],
          solution: `with months as (
  -- Start from the calendar, not from the data, so empty months survive.
  select generate_series('2024-01-01'::date, '2024-03-01'::date, interval '1 month')::date
    as month_start
),
monthly as (
  select
    date_trunc('month', o.placed_at)::date as month_start,
    count(*)::int as orders,
    count(distinct o.customer_id)::int as customers,
    sum(o.total_cents)::int as revenue_cents,
    round(avg(o.total_cents))::int as avg_order_cents
  from orders o
  where o.status = 'paid'
  group by 1
),
joined as (
  select
    m.month_start,
    coalesce(mo.orders, 0) as orders,
    coalesce(mo.customers, 0) as customers,
    coalesce(mo.revenue_cents, 0) as revenue_cents,
    coalesce(mo.avg_order_cents, 0) as avg_order_cents
  from months m
  left join monthly mo on mo.month_start = m.month_start
),
windowed as (
  select
    j.*,
    sum(j.revenue_cents) over (order by j.month_start) as running_revenue_cents,
    lag(j.revenue_cents, 1, 0) over (order by j.month_start) as prev_month_cents
  from joined j
)
select
  to_char(w.month_start, 'YYYY-MM') as month,
  w.orders,
  w.customers,
  w.revenue_cents,
  w.avg_order_cents,
  w.running_revenue_cents::int as running_revenue_cents,
  w.prev_month_cents::int as prev_month_cents,
  case
    when w.prev_month_cents = 0 then 0
    else round((w.revenue_cents - w.prev_month_cents) * 100.0 / w.prev_month_cents, 1)
  end as growth_pct
from windowed w
order by w.month_start;
`,
          tests: `const rowsByMonth = async () => {
  const rows = await queryUser();
  return { rows, byMonth: Object.fromEntries(rows.map((r) => [r.month, r])) };
};

// Paid orders in the fixture:
//   2024-01: 12000 (Ada), 4500 (Ada), 31000 (Bob)         -> 3 orders, 2 customers, 47500
//   2024-02: 7800 (Chen), 15000 (Chen), 990 (Dara)        -> 3 orders, 2 customers, 23790
//   2024-03: nothing
describe('coverage', () => {
  it('returns one row per month in the range', async () => {
    const { rows } = await rowsByMonth();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.month)).toEqual(['2024-01', '2024-02', '2024-03']);
  });

  it('includes a month with no revenue at all', async () => {
    const { byMonth } = await rowsByMonth();
    expect(byMonth['2024-03']).toBeTruthy();
    expect(num(byMonth['2024-03'].orders)).toBe(0);
    expect(num(byMonth['2024-03'].revenue_cents)).toBe(0);
    expect(num(byMonth['2024-03'].customers)).toBe(0);
    expect(num(byMonth['2024-03'].avg_order_cents)).toBe(0);
  });

  it('has the expected columns', async () => {
    const { rows } = await rowsByMonth();
    expect(Object.keys(rows[0]).sort()).toEqual([
      'avg_order_cents', 'customers', 'growth_pct', 'month',
      'orders', 'prev_month_cents', 'revenue_cents', 'running_revenue_cents',
    ]);
  });
});

describe('monthly aggregates', () => {
  it('counts paid orders per month', async () => {
    const { byMonth } = await rowsByMonth();
    expect(num(byMonth['2024-01'].orders)).toBe(3);
    expect(num(byMonth['2024-02'].orders)).toBe(3);
  });

  it('counts distinct customers, not orders', async () => {
    const { byMonth } = await rowsByMonth();
    // January: Ada twice plus Bob once = 2 customers.
    expect(num(byMonth['2024-01'].customers)).toBe(2);
    expect(num(byMonth['2024-02'].customers)).toBe(2);
  });

  it('sums only paid revenue', async () => {
    const { byMonth } = await rowsByMonth();
    expect(num(byMonth['2024-01'].revenue_cents)).toBe(47500);
    expect(num(byMonth['2024-02'].revenue_cents)).toBe(23790);
  });

  it('averages per month, rounded', async () => {
    const { byMonth } = await rowsByMonth();
    expect(num(byMonth['2024-01'].avg_order_cents)).toBe(Math.round(47500 / 3));
    expect(num(byMonth['2024-02'].avg_order_cents)).toBe(Math.round(23790 / 3));
  });
});

describe('window calculations', () => {
  it('accumulates a running revenue total', async () => {
    const { byMonth } = await rowsByMonth();
    expect(num(byMonth['2024-01'].running_revenue_cents)).toBe(47500);
    expect(num(byMonth['2024-02'].running_revenue_cents)).toBe(47500 + 23790);
    expect(num(byMonth['2024-03'].running_revenue_cents)).toBe(47500 + 23790);
  });

  it('reports the previous month', async () => {
    const { byMonth } = await rowsByMonth();
    expect(num(byMonth['2024-01'].prev_month_cents)).toBe(0);
    expect(num(byMonth['2024-02'].prev_month_cents)).toBe(47500);
    expect(num(byMonth['2024-03'].prev_month_cents)).toBe(23790);
  });

  it('computes growth to one decimal place', async () => {
    const { byMonth } = await rowsByMonth();
    const feb = Number(byMonth['2024-02'].growth_pct);
    expect(feb).toBeCloseTo(Number((((23790 - 47500) * 100) / 47500).toFixed(1)), 1);
    expect(feb).toBeLessThan(0);

    const mar = Number(byMonth['2024-03'].growth_pct);
    expect(mar).toBeCloseTo(-100, 1);
  });

  it('reports 0 growth rather than dividing by zero in the first month', async () => {
    const { byMonth } = await rowsByMonth();
    expect(Number(byMonth['2024-01'].growth_pct)).toBe(0);
  });

  it('does not truncate growth with integer division', async () => {
    // A whole-number result would betray integer maths; February's is fractional.
    const { byMonth } = await rowsByMonth();
    const feb = Number(byMonth['2024-02'].growth_pct);
    expect(Number.isInteger(feb)).toBe(false);
  });
});

describe('it responds to the data', () => {
  it('picks up a new paid order in an empty month', async () => {
    await q("insert into orders (customer_id, status, total_cents, placed_at) " +
            "values (6, 'paid', 10000, '2024-03-15')");
    const rows = await q(userSql);
    const byMonth = Object.fromEntries(rows.map((r) => [r.month, r]));
    expect(num(byMonth['2024-03'].orders)).toBe(1);
    expect(num(byMonth['2024-03'].customers)).toBe(1);
    expect(num(byMonth['2024-03'].revenue_cents)).toBe(10000);
    expect(num(byMonth['2024-03'].running_revenue_cents)).toBe(47500 + 23790 + 10000);
  });

  it('ignores a new order that is not paid', async () => {
    await q("insert into orders (customer_id, status, total_cents, placed_at) " +
            "values (6, 'pending', 99999, '2024-03-15')");
    const rows = await q(userSql);
    const byMonth = Object.fromEntries(rows.map((r) => [r.month, r]));
    expect(num(byMonth['2024-03'].revenue_cents)).toBe(0);
  });

  it('ignores orders outside the reporting range', async () => {
    await q("insert into orders (customer_id, status, total_cents, placed_at) values " +
            "(1, 'paid', 55555, '2023-12-15'), (1, 'paid', 66666, '2024-04-02')");
    const rows = await q(userSql);
    expect(rows).toHaveLength(3);
    const total = num(rows[2].running_revenue_cents);
    expect(total).toBe(47500 + 23790);
  });
});`,
        },
      ],
    },
  ],
});

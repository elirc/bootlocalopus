import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'sql-from-code',
  title: 'Postgres from code',
  summary: 'The application side of the database: parameters and allowlists, transactions that move money exactly once, and batching away the N+1.',
  lessons: [
    {
      id: 'sec-sql-injection',
      title: 'Parameterise, and allowlist what you cannot',
      kind: 'node-db',
      xp: 95,
      why: 'SQL injection is still in the OWASP top ten because string-built queries still ship, usually in the one place parameters cannot reach: ORDER BY.',
      tags: ['security', 'sql injection', 'parameters', 'allowlist'],
      hints: [
        'Values go in the array: `conn.query(\'select … where owner_id = $1 and …\', [ownerId, q])`. The database never parses `$1` as SQL, so quotes, semicolons and comments in it are just characters.',
        'Search literally without LIKE: `($2::text = \'\' or strpos(lower(title), lower($2::text)) > 0)`. With `ilike \'%\' || $2 || \'%\'`, a `%` or `_` in the search would still be a wildcard, and you would have to escape them.',
        '`order by $3` does not work — it sorts by a constant string. Map the user\'s choice to SQL you wrote: `const SORT_COLUMNS = { created_at: \'created_at\', title: \'title\' }`, and interpolate the value from the map, never the input.',
        '`SORT_COLUMNS[\'constructor\']` is a function and `\'toString\' in SORT_COLUMNS` is true: every object inherits them. Check with `typeof sort === \'string\' && Object.hasOwn(SORT_COLUMNS, sort)` — which also rejects the array a repeated `?sort=` produces.',
        'Validate all three parameters before the query, and throw `new BadRequestError(\'sort\', …)` (or `\'dir\'`, `\'q\'`). End the ORDER BY with `, id ${direction}` so equal timestamps always come out the same way.',
      ],
    },
    {
      id: 'node-db-transactions',
      title: 'Transactions in code: moving money',
      kind: 'node-db',
      xp: 110,
      why: 'Every payment, stock count and booking system is this function; getting it slightly wrong loses money quietly and only under load or on retry.',
      tags: ['transactions', 'idempotency', 'concurrency', 'rollback'],
      hints: [
        'The skeleton: `await conn.query(\'begin\'); try { const r = await work(); await conn.query(\'commit\'); return r; } catch (err) { await conn.query(\'rollback\').catch(() => {}); throw err; }`. Validation goes before `begin`.',
        'The debit is one statement that checks and writes: `update accounts set balance_cents = balance_cents - $1 where id = $2 and balance_cents >= $1 returning balance_cents`. Zero rows back means "no" — then a `select 1 from accounts where id = $1` tells insufficient funds from a missing account.',
        'A credit that returns zero rows means `to` does not exist: throw `AccountNotFoundError(to)` and let the catch block roll back the debit. Never try to "undo" it with a compensating UPDATE.',
        'Replay first, inside the transaction: `select request, response from idempotency_keys where key = $1`. Same `from`/`to`/`cents` → return `response` as stored (jsonb comes back as an object). Different → `IdempotencyKeyReusedError`.',
        'Last, in the same transaction: `insert into idempotency_keys (key, request, response) values ($1, $2::jsonb, $3::jsonb)` with `JSON.stringify({ from, to, cents })` and `JSON.stringify(result)`. Because it commits with the money, a failed transfer leaves no key behind.',
      ],
    },
    {
      id: 'node-dataloader',
      title: 'Batching away the N+1 in app code',
      kind: 'node',
      xp: 100,
      why: 'When the N queries come from N independent callers, no single query can fix it; a loader is how GraphQL servers and service layers stay at one round trip.',
      tags: ['n+1', 'batching', 'promises', 'event loop'],
      hints: [
        'Keep a `pending` Map for the batch being collected, `null` when there is none. The first `load` of a batch creates it and schedules `dispatch`; later loads just add to it.',
        'Schedule with `setImmediate(dispatch)`: it runs after every promise continuation of the current turn. (`queueMicrotask` runs in the middle of them, so a load after two `await null`s misses the batch.) In `dispatch`, set `pending = null` first, so loads made from then on start the next batch.',
        'Dedupe by storing one entry per key: `{ promise, resolve, reject }`, created with `new Promise((resolve, reject) => …)`. A second `load` of the key returns the same `entry.promise`.',
        'Call `batchFn` inside `try { const results = await batchFn(keys); … }` — `await` inside the `try` also catches a synchronous throw. If `results` is not `instanceof Map`, throw a `TypeError` there; the catch rejects every entry of the chunk.',
        'Per key: `const v = results.get(key); v instanceof Error ? entry.reject(v) : entry.resolve(v ?? null)`. For `maxBatchSize`, loop `for (let i = 0; i < keys.length; i += size)` over `keys.slice(i, i + size)`, each chunk its own call.',
      ],
    },
  ],
});

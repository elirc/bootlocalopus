/**
 * PGlite (Postgres compiled to WASM) seeded with the lesson's fixture.
 *
 * `sql` lessons: the learner's SQL runs once, up front, outside any
 * transaction (so DDL answers leave their tables for every test); then each
 * test runs inside a transaction that is rolled back. The environment
 * verifies that the transaction a test started is still the one being rolled
 * back: a test that COMMITs would otherwise leak rows into the next.
 *
 * `node-db` lessons: the same database and `db` global, but no per-test
 * transaction; those lessons manage their own.
 */
const normRow = (row) => {
  if (row === null || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'bigint' ? Number(v) : v;
  return out;
};

const lastRows = (results) => {
  const list = Array.isArray(results) ? results : [results];
  const last = list[list.length - 1];
  return ((last && last.rows) || []).map(normRow);
};

/**
 * @param {{ fixtures?: string, code?: string, mode: 'sql' | 'node-db' }} opts
 * Fixture failures throw (the caller reports phase `fixture`).
 */
export async function setupPostgres({ fixtures, code, mode }) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create();
  if (fixtures) await db.exec(fixtures);

  /** A query the grader runs itself. With params: one prepared statement. Without: any number of statements, rows of the last. */
  const q = async (sqlText, params) => {
    if (params !== undefined) {
      const r = await db.query(sqlText, params);
      return ((r && r.rows) || []).map(normRow);
    }
    return lastRows(await db.exec(sqlText));
  };

  if (mode === 'node-db') {
    return {
      db,
      globals: { db, q },
      async afterReady() { return null; },
      attach() {},
      dirty: () => false,
    };
  }

  let cached = null;
  const execUser = async () => {
    if (!cached) {
      try { cached = { results: await db.exec(code) }; }
      catch (e) { cached = { error: e }; }
    }
    if (cached.error) throw cached.error;
    return cached.results;
  };
  const queryUser = async () => lastRows(await execUser());

  let dirty = false;

  return {
    db,
    globals: { db, userSql: code, execUser, queryUser, q },
    /**
     * Runs the learner's SQL once (after `ready`: it is their code) and
     * checks it did not leave a transaction open. Returns an error message
     * for phase `load`, or null.
     */
    async afterReady() {
      await execUser().catch(() => {});
      // SAVEPOINT only succeeds inside a transaction block, which is exactly
      // the state a BEGIN without COMMIT leaves behind (whether or not the
      // transaction has written anything yet).
      let open = false;
      try {
        await db.exec('savepoint __grader_probe');
        open = true;
      } catch (e) {
        // Not in a transaction block is the good case; an aborted block is still an open one.
        if (/aborted/i.test(String(e && e.message))) open = true;
      }
      if (open) {
        await db.exec('rollback').catch(() => {});
        // If their SQL failed part-way, that error is the useful message, and
        // every test that runs it will show it.
        if (!cached.error) return 'Your SQL starts a transaction with BEGIN but never COMMITs it.';
      }
      return null;
    },
    attach(harness) {
      let txid = null;
      harness.addRootHook('beforeEach', async () => {
        await db.exec('begin');
        const r = await db.query('select pg_current_xact_id()::text as id');
        txid = r.rows[0].id;
      });
      harness.addRootHook('afterEach', async () => {
        let intact = true;
        try {
          const r = await db.query('select pg_current_xact_id_if_assigned()::text as id');
          intact = r.rows[0].id === txid;
        } catch {
          // "current transaction is aborted": a statement failed inside our
          // transaction, which is still ours to roll back.
          intact = true;
        }
        await db.exec('rollback').catch(() => {});
        txid = null;
        if (!intact) {
          dirty = true;
          return 'This test ended the grading transaction (COMMIT/ROLLBACK); later tests would have seen its data.';
        }
        return undefined;
      });
    },
    dirty: () => dirty,
  };
}

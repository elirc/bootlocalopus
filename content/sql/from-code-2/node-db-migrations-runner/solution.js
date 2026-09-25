import { createHash } from 'node:crypto';

export class MigrationChecksumError extends Error {
  constructor(migrationId) {
    super(`migration ${migrationId} was edited after it was applied`);
    this.name = 'MigrationChecksumError';
    this.migrationId = migrationId;
  }
}

export class MigrationFailedError extends Error {
  constructor(migrationId, cause) {
    super(`migration ${migrationId} failed: ${cause && cause.message}`, { cause });
    this.name = 'MigrationFailedError';
    this.migrationId = migrationId;
  }
}

export const checksum = (sql) => createHash('sha256').update(sql, 'utf8').digest('hex');

function validate(migrations) {
  if (!Array.isArray(migrations)) throw new RangeError('migrations must be an array');
  const seen = new Set();
  for (const m of migrations) {
    if (!m || typeof m.id !== 'string' || m.id === '' || typeof m.sql !== 'string') {
      throw new RangeError('every migration needs a string id and sql');
    }
    if (seen.has(m.id)) throw new RangeError(`duplicate migration id ${m.id}`);
    seen.add(m.id);
  }
}

/**
 * Apply every migration not yet recorded in schema_migrations, in id order,
 * each in its own transaction. Resolves to the ids applied by this run.
 */
export async function migrate(conn, migrations) {
  validate(migrations);
  const ordered = [...migrations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  await conn.query(`create table if not exists schema_migrations (
    id text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`);

  const { rows } = await conn.query('select id, checksum from schema_migrations');
  const applied = new Map(rows.map((r) => [r.id, r.checksum]));

  // Refuse to run anything if history was rewritten: the database no longer
  // matches what the files say it is.
  for (const m of ordered) {
    if (applied.has(m.id) && applied.get(m.id) !== checksum(m.sql)) throw new MigrationChecksumError(m.id);
  }

  const ran = [];
  for (const m of ordered) {
    if (applied.has(m.id)) continue;
    await conn.query('begin');
    try {
      // DDL is transactional in Postgres: a failure halfway through a
      // migration leaves none of it behind.
      await conn.exec(m.sql);
      await conn.query('insert into schema_migrations (id, checksum) values ($1, $2)', [m.id, checksum(m.sql)]);
      await conn.query('commit');
    } catch (err) {
      await conn.query('rollback').catch(() => {});
      throw new MigrationFailedError(m.id, err);
    }
    ran.push(m.id);
  }
  return ran;
}

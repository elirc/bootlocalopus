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

/**
 * Apply every migration not yet recorded, in id order, each in its own
 * transaction. Resolves to the ids applied by this run.
 *
 * Today: runs everything, every time, and a failure halfway leaves the
 * database half-migrated.
 */
export async function migrate(conn, migrations) {
  for (const m of migrations) await conn.exec(m.sql);
  return migrations.map((m) => m.id);
}

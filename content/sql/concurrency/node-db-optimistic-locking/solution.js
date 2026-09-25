export class DocumentNotFoundError extends Error {
  constructor(id) {
    super(`document ${id} does not exist`);
    this.name = 'DocumentNotFoundError';
    this.id = id;
  }
}

export class VersionConflictError extends Error {
  constructor(id, expectedVersion, currentVersion) {
    super(`document ${id} is at version ${currentVersion}, not ${expectedVersion}`);
    this.name = 'VersionConflictError';
    this.id = id;
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}

const COLUMNS = 'id, title, body, version';

export async function getDocument(conn, id) {
  const { rows } = await conn.query(`select ${COLUMNS} from documents where id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Save only if nobody else has saved since `expectedVersion` was read.
 * The version check is part of the UPDATE, so there is no gap between
 * "is it still mine?" and the write.
 */
export async function saveDocument(conn, { id, expectedVersion, title, body }) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new RangeError('expectedVersion must be a positive integer');
  }
  const { rows } = await conn.query(
    `update documents
        set title = $1, body = $2, version = version + 1, updated_at = now()
      where id = $3 and version = $4
      returning ${COLUMNS}`,
    [title, body, id, expectedVersion],
  );
  if (rows.length > 0) return rows[0];

  // Nothing updated: explain why. This read is only for the error message;
  // the decision was already made by the UPDATE.
  const current = await getDocument(conn, id);
  if (!current) throw new DocumentNotFoundError(id);
  throw new VersionConflictError(id, expectedVersion, current.version);
}

/**
 * Read, change, save; on a conflict, start again from a fresh read so the
 * other writer's change is kept and ours is re-applied on top of it.
 */
export async function updateWithRetry(conn, id, mutate, { maxAttempts = 3 } = {}) {
  let lastConflict;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const doc = await getDocument(conn, id);
    if (!doc) throw new DocumentNotFoundError(id);
    const { title, body } = await mutate(doc);
    try {
      return await saveDocument(conn, { id, expectedVersion: doc.version, title, body });
    } catch (err) {
      if (!(err instanceof VersionConflictError)) throw err;
      lastConflict = err;
    }
  }
  throw lastConflict;
}

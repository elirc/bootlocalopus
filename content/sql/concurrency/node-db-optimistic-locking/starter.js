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

export async function getDocument(conn, id) {
  const { rows } = await conn.query('select id, title, body, version from documents where id = $1', [id]);
  return rows[0] ?? null;
}

/** Last write wins: whatever was saved since this editor loaded the page is overwritten. */
export async function saveDocument(conn, { id, expectedVersion, title, body }) {
  const { rows } = await conn.query(
    `update documents set title = $1, body = $2, version = version + 1, updated_at = now()
      where id = $3
      returning id, title, body, version`,
    [title, body, id],
  );
  return rows[0];
}

export async function updateWithRetry(conn, id, mutate, { maxAttempts = 3 } = {}) {
  throw new Error('not implemented');
}

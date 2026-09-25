export class LastDoctorError extends Error {
  constructor(shift, doctorId) {
    super(`doctor ${doctorId} is the last one on call for ${shift}`);
    this.name = 'LastDoctorError';
    this.shift = shift;
    this.doctorId = doctorId;
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `work(conn)` in a SERIALIZABLE transaction, retrying on 40001 / 40P01.
 *
 * Today: one attempt at the default isolation level.
 */
export async function withSerializableRetry(conn, work, { maxAttempts = 5, baseDelayMs = 10, sleep = defaultSleep } = {}) {
  await conn.query('begin');
  try {
    const result = await work(conn);
    await conn.query('commit');
    return result;
  } catch (err) {
    await conn.query('rollback');
    throw err;
  }
}

export async function goOffCall(conn, shift, doctorId) {
  throw new Error('not implemented');
}

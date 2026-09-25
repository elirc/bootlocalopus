export class LastDoctorError extends Error {
  constructor(shift, doctorId) {
    super(`doctor ${doctorId} is the last one on call for ${shift}`);
    this.name = 'LastDoctorError';
    this.shift = shift;
    this.doctorId = doctorId;
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 40001 serialization_failure, 40P01 deadlock_detected: the transaction did
// nothing wrong, it just lost a race. Running it again from BEGIN is safe.
const RETRYABLE = new Set(['40001', '40P01']);
const isRetryable = (err) => err != null && RETRYABLE.has(err.code);

/**
 * Run `work(conn)` in a SERIALIZABLE transaction, retrying on 40001 / 40P01.
 * `work` may run several times, so it must not have side effects outside
 * the database (no emails, no HTTP calls) — do those after it resolves.
 */
export async function withSerializableRetry(conn, work, { maxAttempts = 5, baseDelayMs = 10, sleep = defaultSleep } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await conn.query('begin isolation level serializable');
      const result = await work(conn);
      await conn.query('commit'); // may itself fail with 40001
      return result;
    } catch (err) {
      await conn.query('rollback').catch(() => {});
      if (!isRetryable(err) || attempt >= maxAttempts) throw err;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

/** Take `doctorId` off call for `shift`, unless they are the last one. */
export function goOffCall(conn, shift, doctorId) {
  return withSerializableRetry(conn, async (tx) => {
    const { rows } = await tx.query('select doctor_id from on_call where shift = $1', [shift]);
    const onCall = rows.map((r) => r.doctor_id);
    if (!onCall.includes(doctorId)) return onCall.length;
    if (onCall.length === 1) throw new LastDoctorError(shift, doctorId);
    await tx.query('delete from on_call where shift = $1 and doctor_id = $2', [shift, doctorId]);
    return onCall.length - 1;
  });
}

export function createWorker({
  store,
  handlers,
  workerId = 'worker',
  concurrency = 2,
  pollIntervalMs = 1000,
  heartbeatMs = 10_000,
  maxAttempts = 5,
  backoff = (attempt) => 1000 * 2 ** (attempt - 1),
  isPermanent = () => false,
  timers = { setTimeout, clearTimeout },
}) {
  let active = 0;

  // TODO: claim up to `concurrency` jobs, poll when idle, heartbeat, retry or
  // bury failures, and stop() with a grace period.
  // This version runs one job, never heartbeats and never stops cleanly.
  return {
    async start() {
      const job = await store.claim(workerId);
      if (!job) return;
      active++;
      try {
        await handlers[job.type](job.payload, { id: job.id, attempt: job.attempt, signal: new AbortController().signal });
        await store.complete(job.id, job.token);
      } catch {
        // swallowed: the job is lost until its lease expires
      }
      active--;
    },
    async stop() {
      return { released: 0 };
    },
    get active() {
      return active;
    },
  };
}

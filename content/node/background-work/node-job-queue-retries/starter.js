export function createQueue({
  handlers,
  concurrency = 1,
  maxAttempts = 3,
  backoff = (attempt) => 1000 * 2 ** (attempt - 1),
  timers = { setTimeout, clearTimeout },
}) {
  const jobs = new Map();
  let nextId = 1;

  // TODO: FIFO with `concurrency` slots, retries that wait via timers.setTimeout
  // *without* holding a slot, states, snapshots and onIdle().
  // This version runs every job at once and never retries.
  return {
    enqueue(type, payload) {
      const id = `job_${nextId++}`;
      const job = { id, type, payload, state: 'running', attempts: 1, lastError: null };
      jobs.set(id, job);
      Promise.resolve()
        .then(() => handlers[type](payload, { id, attempt: 1 }))
        .then(() => { job.state = 'succeeded'; }, (e) => { job.state = 'failed'; job.lastError = e.message; });
      return id;
    },
    get(id) {
      return jobs.get(id);
    },
    onIdle() {
      return Promise.resolve();
    },
  };
}

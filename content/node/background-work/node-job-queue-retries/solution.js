export function createQueue({
  handlers,
  concurrency = 1,
  maxAttempts = 3,
  backoff = (attempt) => 1000 * 2 ** (attempt - 1),
  timers = { setTimeout, clearTimeout },
}) {
  const jobs = new Map();
  const ready = [];       // ids of queued jobs, FIFO
  let running = 0;
  let waiting = 0;
  let nextId = 1;
  let idleWaiters = [];

  const isIdle = () => ready.length === 0 && running === 0 && waiting === 0;

  function settleIdle() {
    if (!isIdle()) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function pump() {
    while (running < concurrency && ready.length > 0) {
      start(jobs.get(ready.shift()));
    }
    settleIdle();
  }

  function start(job) {
    running++;
    job.state = 'running';
    job.attempts++;
    // new Promise turns a synchronous throw into a rejection.
    new Promise((resolve) => resolve(handlers[job.type](job.payload, { id: job.id, attempt: job.attempts })))
      .then(
        () => { job.state = 'succeeded'; },
        (error) => fail(job, error),
      )
      .finally(() => {
        running--;
        pump();
      });
  }

  function fail(job, error) {
    job.lastError = error instanceof Error ? error.message : String(error);
    if (job.attempts >= maxAttempts) {
      job.state = 'failed';
      return;
    }
    // Back off *outside* the slot: the timer holds the job, not the worker.
    job.state = 'waiting';
    waiting++;
    timers.setTimeout(() => {
      waiting--;
      job.state = 'queued';
      ready.push(job.id);
      pump();
    }, backoff(job.attempts));
  }

  return {
    enqueue(type, payload) {
      if (!Object.hasOwn(handlers, type)) throw new TypeError(`unknown job type "${type}"`);
      const id = `job_${nextId++}`;
      jobs.set(id, { id, type, payload, state: 'queued', attempts: 0, lastError: null });
      ready.push(id);
      pump();
      return id;
    },

    get(id) {
      const job = jobs.get(id);
      return job && { ...job };
    },

    onIdle() {
      if (isIdle()) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}

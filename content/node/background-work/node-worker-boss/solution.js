const messageOf = (error) => (error instanceof Error ? error.message : String(error));

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
  const runs = new Set();      // jobs this worker still owns
  let started = false;
  let stopping = false;
  let filling = false;
  let claimTask = null;        // the claim in flight, if any
  let pollTimer = null;
  let onDrained = null;        // set by stop(): called when `runs` empties
  let released = 0;

  /** Store writes are best effort: if one fails, the lease expires and the job comes back. */
  const quietly = async (fn) => { try { await fn(); } catch { /* ignored on purpose */ } };

  function schedulePoll() {
    if (pollTimer !== null || stopping) return;
    pollTimer = timers.setTimeout(() => { pollTimer = null; fill(); }, pollIntervalMs);
  }

  /** One claim. A job that arrives after stop() began is handed straight back. */
  async function claimOne() {
    let job;
    try {
      job = await store.claim(workerId);
    } catch {
      job = null;
    }
    if (job && stopping) {
      released++;
      await quietly(() => store.release(job.id, job.token, { delayMs: 0 }));
      return null;
    }
    return job;
  }

  async function fill() {
    if (filling || !started || stopping) return;
    filling = true;
    try {
      while (!stopping && runs.size < concurrency) {
        claimTask = claimOne();
        const job = await claimTask;
        claimTask = null;
        if (!job) {
          schedulePoll();
          return;
        }
        run(job);
      }
    } finally {
      filling = false;
    }
  }

  /** A slot freed up: refill, or tell stop() that everything has drained. */
  function slotFreed() {
    if (!stopping) return fill();
    if (runs.size === 0 && onDrained) onDrained();
  }

  function run(job) {
    const r = { job, controller: new AbortController(), beat: null };
    runs.add(r);

    // Give the job up: no more heartbeats, and its result will be ignored.
    r.disown = () => {
      if (r.beat !== null) timers.clearTimeout(r.beat);
      r.beat = null;
      runs.delete(r);
    };
    const owned = () => runs.has(r);

    const scheduleBeat = () => {
      r.beat = timers.setTimeout(async () => {
        r.beat = null;
        if (!owned()) return;
        try {
          await store.heartbeat(job.id, job.token);
          if (owned()) scheduleBeat();
        } catch {
          if (!owned()) return;
          // The lease is lost: someone else may be running this job now.
          r.disown();
          r.controller.abort(new Error('lease lost'));
          slotFreed();
        }
      }, heartbeatMs);
    };

    if (!Object.hasOwn(handlers, job.type)) {
      r.disown();
      quietly(() => store.bury(job.id, job.token, { reason: 'unknown-type', error: `no handler for "${job.type}"` }))
        .then(slotFreed);
      return;
    }

    scheduleBeat();
    new Promise((resolve) => resolve(handlers[job.type](job.payload, { id: job.id, attempt: job.attempt, signal: r.controller.signal })))
      .then(
        async () => {
          if (!owned()) return;
          r.disown();
          await quietly(() => store.complete(job.id, job.token));
        },
        async (error) => {
          if (!owned()) return;
          r.disown();
          if (isPermanent(error)) {
            await quietly(() => store.bury(job.id, job.token, { reason: 'permanent', error: messageOf(error) }));
          } else if (job.attempt >= maxAttempts) {
            await quietly(() => store.bury(job.id, job.token, { reason: 'max-attempts', error: messageOf(error) }));
          } else {
            await quietly(() => store.release(job.id, job.token, { delayMs: backoff(job.attempt) }));
          }
        },
      )
      .then(slotFreed);
  }

  return {
    start() {
      if (started) return;
      started = true;
      fill();
    },

    get active() {
      return runs.size;
    },

    async stop({ graceMs = 30_000 } = {}) {
      stopping = true;
      if (pollTimer !== null) timers.clearTimeout(pollTimer);
      pollTimer = null;
      if (claimTask) await claimTask;
      if (runs.size === 0) return { released };

      await new Promise((resolve) => {
        const grace = timers.setTimeout(async () => {
          onDrained = null;
          const leftovers = [...runs];
          for (const r of leftovers) {
            r.disown();
            r.controller.abort(new Error('worker shutting down'));
            released++;
          }
          await Promise.all(leftovers.map((r) => quietly(() => store.release(r.job.id, r.job.token, { delayMs: 0 }))));
          resolve();
        }, graceMs);
        onDrained = () => {
          onDrained = null;
          timers.clearTimeout(grace);
          resolve();
        };
      });
      return { released };
    },
  };
}

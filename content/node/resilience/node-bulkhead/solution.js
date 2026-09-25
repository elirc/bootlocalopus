export class BulkheadFullError extends Error {
  constructor() {
    super('bulkhead is full');
    this.name = 'BulkheadFullError';
  }
}

export class QueueTimeoutError extends Error {
  constructor() {
    super('timed out waiting for a bulkhead slot');
    this.name = 'QueueTimeoutError';
  }
}

export function createBulkhead({ maxConcurrent, maxQueue = 0, queueTimeoutMs = Infinity, timers = { setTimeout, clearTimeout } }) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) throw new RangeError('maxConcurrent must be a positive integer');
  if (!Number.isInteger(maxQueue) || maxQueue < 0) throw new RangeError('maxQueue must be a non-negative integer');

  let active = 0;
  const queue = []; // { start, timer }

  const execute = (fn) => {
    active++;
    // new Promise turns a synchronous throw into a rejection.
    const result = new Promise((resolve) => resolve(fn()));
    // The slot is freed whatever happens; the caller still sees the original outcome.
    result.then(release, release);
    return result;
  };

  const release = () => {
    active--;
    const next = queue.shift();
    if (next) {
      if (next.timer !== undefined) timers.clearTimeout(next.timer);
      next.start();
    }
  };

  return {
    run(fn) {
      if (active < maxConcurrent) return execute(fn);
      if (queue.length >= maxQueue) return Promise.reject(new BulkheadFullError());

      return new Promise((resolve, reject) => {
        const waiter = {
          timer: undefined,
          start: () => execute(fn).then(resolve, reject),
        };
        if (Number.isFinite(queueTimeoutMs)) {
          waiter.timer = timers.setTimeout(() => {
            const i = queue.indexOf(waiter);
            if (i !== -1) queue.splice(i, 1);
            reject(new QueueTimeoutError());
          }, queueTimeoutMs);
        }
        queue.push(waiter);
      });
    },

    stats() {
      return { active, queued: queue.length };
    },
  };
}

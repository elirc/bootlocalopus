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
  let active = 0;

  return {
    async run(fn) {
      // TODO: a bounded queue, queue timeouts, and fail-fast when full.
      // This version just counts, and never says no.
      active++;
      try {
        return await fn();
      } finally {
        active--;
      }
    },

    stats() {
      return { active, queued: 0 };
    },
  };
}

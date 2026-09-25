function assertConcurrency(n) {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${n}`);
  }
}

export class PriorityPool {
  #concurrency;
  #queue = [];        // entries sorted best-first: { task, priority, seq, signal, resolve, reject, onAbort }
  #seq = 0;           // insertion counter: the FIFO tiebreaker
  #running = 0;
  #paused = false;
  #idleWaiters = [];

  constructor({ concurrency = 1 } = {}) {
    assertConcurrency(concurrency);
    this.#concurrency = concurrency;
  }

  get size() {
    return this.#queue.length;
  }

  get running() {
    return this.#running;
  }

  run(task, { priority = 0, signal } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason);

    return new Promise((resolve, reject) => {
      const entry = { task, priority, seq: this.#seq++, signal, resolve, reject, onAbort: null };
      if (signal) {
        entry.onAbort = () => {
          if (this.#remove(entry)) reject(signal.reason);
        };
        signal.addEventListener('abort', entry.onAbort);
      }
      this.#insert(entry);
      this.#drain();
    });
  }

  clear(reason) {
    const dropped = this.#queue.splice(0);
    for (const entry of dropped) {
      this.#detach(entry);
      entry.reject(reason);
    }
    this.#checkIdle();
  }

  pause() {
    this.#paused = true;
  }

  resume() {
    this.#paused = false;
    this.#drain();
  }

  setConcurrency(n) {
    assertConcurrency(n);
    this.#concurrency = n;
    this.#drain();
  }

  onIdle() {
    if (this.#isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  // Keep the queue sorted: after every entry with a higher priority, and after
  // equal priorities that arrived earlier. Binary search keeps inserts cheap.
  #insert(entry) {
    let lo = 0;
    let hi = this.#queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.#queue[mid].priority >= entry.priority) lo = mid + 1;
      else hi = mid;
    }
    this.#queue.splice(lo, 0, entry);
  }

  #remove(entry) {
    const i = this.#queue.indexOf(entry);
    if (i === -1) return false;
    this.#queue.splice(i, 1);
    this.#detach(entry);
    this.#checkIdle();
    return true;
  }

  #detach(entry) {
    if (entry.onAbort) entry.signal.removeEventListener('abort', entry.onAbort);
  }

  #drain() {
    while (!this.#paused && this.#running < this.#concurrency && this.#queue.length > 0) {
      const entry = this.#queue.shift();
      this.#detach(entry);
      this.#running++;
      let result;
      try {
        result = Promise.resolve(entry.task(entry.signal));
      } catch (error) {
        result = Promise.reject(error);
      }
      result
        .then(entry.resolve, entry.reject)
        .then(() => {
          this.#running--;
          this.#drain();
          this.#checkIdle();
        });
    }
  }

  #isIdle() {
    return this.#running === 0 && this.#queue.length === 0;
  }

  #checkIdle() {
    if (!this.#isIdle()) return;
    for (const resolve of this.#idleWaiters.splice(0)) resolve();
  }
}

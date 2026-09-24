export class TaskQueue {
  #pending = [];
  #running = 0;
  #idleWaiters = [];
  #controller = new AbortController();
  #abortReason = null;

  constructor({ concurrency = 1 } = {}) {
    this.concurrency = Math.max(1, concurrency);
  }

  get size() {
    return this.#pending.length;
  }

  get running() {
    return this.#running;
  }

  push(task) {
    if (this.#abortReason) return Promise.reject(this.#abortReason);
    return new Promise((resolve, reject) => {
      this.#pending.push({ task, resolve, reject });
      this.#drain();
    });
  }

  onIdle() {
    if (this.#running === 0 && this.#pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  abort(reason = new Error('queue aborted')) {
    this.#abortReason = reason;
    this.#controller.abort(reason);
    const dropped = this.#pending.splice(0, this.#pending.length);
    for (const entry of dropped) entry.reject(reason);
    this.#checkIdle();
  }

  #drain() {
    while (this.#running < this.concurrency && this.#pending.length > 0) {
      const entry = this.#pending.shift();
      this.#running++;
      // Start, do not await: the loop must be free to fill the other slots.
      Promise.resolve()
        .then(() => entry.task(this.#controller.signal))
        .then(entry.resolve, entry.reject)
        .finally(() => {
          this.#running--;
          this.#drain();
          this.#checkIdle();
        });
    }
  }

  #checkIdle() {
    if (this.#running === 0 && this.#pending.length === 0) {
      const waiters = this.#idleWaiters.splice(0, this.#idleWaiters.length);
      for (const resolve of waiters) resolve();
    }
  }
}

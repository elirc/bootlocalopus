export class Semaphore {
  #available;
  #queue = []; // entries: { grant, reject, signal, onAbort }

  constructor(permits) {
    if (!Number.isInteger(permits) || permits < 1) {
      throw new RangeError(`permits must be a positive integer, got ${permits}`);
    }
    this.#available = permits;
  }

  get available() {
    return this.#available;
  }

  get waiting() {
    return this.#queue.length;
  }

  acquire({ signal } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason);

    if (this.#available > 0 && this.#queue.length === 0) {
      this.#available--;
      return Promise.resolve(this.#makeRelease());
    }

    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, signal, onAbort: null };
      if (signal) {
        entry.onAbort = () => {
          const i = this.#queue.indexOf(entry);
          if (i !== -1) this.#queue.splice(i, 1);
          reject(signal.reason);
        };
        signal.addEventListener('abort', entry.onAbort, { once: true });
      }
      this.#queue.push(entry);
    });
  }

  async use(fn) {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  #makeRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#handOff();
    };
  }

  // A freed permit goes straight to the oldest waiter, never back to the pool
  // first — otherwise a newcomer could barge in ahead of the queue.
  #handOff() {
    const next = this.#queue.shift();
    if (!next) {
      this.#available++;
      return;
    }
    if (next.onAbort) next.signal.removeEventListener('abort', next.onAbort);
    next.resolve(this.#makeRelease());
  }
}

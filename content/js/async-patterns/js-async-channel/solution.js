const DONE = Object.freeze({ value: undefined, done: true });

export class Channel {
  #buffer = [];
  #waiters = [];        // { resolve, reject } of next() calls waiting for a value
  #state = 'open';      // 'open' | 'closed' (producer ended) | 'cancelled' (consumer ended)
  #error = null;        // set by fail(); delivered once, after the buffer drains
  #highWaterMark;
  #onCancel;

  constructor({ highWaterMark = Infinity, onCancel } = {}) {
    this.#highWaterMark = highWaterMark;
    this.#onCancel = onCancel;
  }

  get size() {
    return this.#buffer.length;
  }

  push(value) {
    if (this.#state === 'cancelled') return false;
    if (this.#state === 'closed') throw new Error('push() after the channel was closed');
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
    } else {
      this.#buffer.push(value);
    }
    return this.#buffer.length < this.#highWaterMark;
  }

  close() {
    this.#end(null);
  }

  fail(error) {
    this.#end(error);
  }

  next() {
    if (this.#buffer.length > 0) {
      return Promise.resolve({ value: this.#buffer.shift(), done: false });
    }
    if (this.#error) {
      const error = this.#error;
      this.#error = null;
      return Promise.reject(error);
    }
    if (this.#state !== 'open') return Promise.resolve(DONE);
    return new Promise((resolve, reject) => this.#waiters.push({ resolve, reject }));
  }

  return() {
    if (this.#state !== 'cancelled') {
      const notify = this.#state === 'open';
      this.#state = 'cancelled';
      this.#buffer.length = 0;
      this.#error = null;
      this.#settleWaiters();
      if (notify) this.#onCancel?.();
    }
    return Promise.resolve(DONE);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  #end(error) {
    if (this.#state !== 'open') return;
    this.#state = 'closed';
    this.#error = error;
    // Waiters only exist while the buffer is empty, so they can end now.
    this.#settleWaiters();
  }

  #settleWaiters() {
    const waiters = this.#waiters.splice(0);
    for (const [i, w] of waiters.entries()) {
      if (i === 0 && this.#error) {
        const error = this.#error;
        this.#error = null;
        w.reject(error);
      } else {
        w.resolve(DONE);
      }
    }
  }
}

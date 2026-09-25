export class SingleFlight {
  #inFlight = new Map(); // key -> promise

  run(key, fn) {
    const existing = this.#inFlight.get(key);
    if (existing) return existing;

    let promise;
    try {
      promise = Promise.resolve(fn());
    } catch (error) {
      promise = Promise.reject(error);
    }

    // Only remove the entry if it is still ours: after forget(), a newer call
    // may own the key. Both handlers are passed to one .then(), so the
    // derived promise always fulfils — no orphan rejection.
    const cleanup = () => {
      if (this.#inFlight.get(key) === promise) this.#inFlight.delete(key);
    };
    promise.then(cleanup, cleanup);

    this.#inFlight.set(key, promise);
    return promise;
  }

  forget(key) {
    this.#inFlight.delete(key);
  }

  get size() {
    return this.#inFlight.size;
  }
}

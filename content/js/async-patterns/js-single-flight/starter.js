export class SingleFlight {
  #inFlight = new Map();

  run(key, fn) {
    // Every caller starts its own call. Share the in-flight one instead.
    return Promise.resolve().then(fn);
  }

  forget(key) {}

  get size() {
    return this.#inFlight.size;
  }
}

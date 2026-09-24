/**
 * createLoader(batchFn, { maxBatchSize }) -> { load(key) }
 *
 * batchFn(keys) resolves to a Map from key to value (or to an Error for that
 * key). load(key) resolves to the value, or null when the Map has none.
 */
export function createLoader(batchFn, { maxBatchSize = Infinity } = {}) {
  if (typeof batchFn !== 'function') throw new TypeError('batchFn must be a function');
  if (!(maxBatchSize === Infinity || (Number.isSafeInteger(maxBatchSize) && maxBatchSize >= 1))) {
    throw new RangeError('maxBatchSize must be a positive integer');
  }

  /** The batch being collected: key -> one pending entry shared by every load of that key. */
  let pending = null;

  function load(key) {
    if (pending === null) {
      pending = new Map();
      // setImmediate runs after this turn's synchronous code AND every
      // promise continuation it queued, so loads made after an `await` of
      // something already settled still join. queueMicrotask would fire in
      // the middle of those continuations and split the batch.
      setImmediate(dispatch);
    }
    let entry = pending.get(key); // Map keys: 1 and '1' are different keys
    if (entry === undefined) {
      entry = {};
      entry.promise = new Promise((resolve, reject) => {
        entry.resolve = resolve;
        entry.reject = reject;
      });
      pending.set(key, entry);
    }
    return entry.promise;
  }

  function dispatch() {
    const batch = pending;
    pending = null; // loads from now on start the next batch
    const keys = [...batch.keys()];
    const size = Math.min(maxBatchSize, keys.length);
    for (let i = 0; i < keys.length; i += size) {
      void runBatch(keys.slice(i, i + size), batch);
    }
  }

  async function runBatch(keys, entries) {
    let results;
    try {
      // Inside the try: a batchFn that throws synchronously must reject the
      // loads, not escape into setImmediate as an uncaught exception.
      results = await batchFn(keys);
      if (!(results instanceof Map)) {
        throw new TypeError(`batchFn must resolve to a Map, got ${Object.prototype.toString.call(results)}`);
      }
    } catch (err) {
      for (const key of keys) entries.get(key).reject(err);
      return;
    }
    for (const key of keys) {
      const value = results.get(key);
      const entry = entries.get(key);
      if (value instanceof Error) entry.reject(value); // one bad key does not fail its neighbours
      else entry.resolve(value ?? null);
    }
  }

  return { load };
}

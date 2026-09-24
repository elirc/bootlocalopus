/**
 * createLoader(batchFn, { maxBatchSize }) -> { load(key) }
 *
 * batchFn(keys) resolves to a Map from key to value (or to an Error for that
 * key). load(key) resolves to the value, or null when the Map has none.
 *
 * TODO: this is the N+1 again — one batchFn call per load(). Collect the keys
 * requested in the same turn of the event loop and make one call for them.
 */
export function createLoader(batchFn, { maxBatchSize = Infinity } = {}) {
  return {
    async load(key) {
      const results = await batchFn([key]);
      const value = results.get(key);
      if (value instanceof Error) throw value;
      return value ?? null;
    },
  };
}

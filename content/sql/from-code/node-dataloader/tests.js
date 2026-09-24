/** A batchFn over a fake "users" table that records every call. */
function usersBatch(table = new Map(Array.from({ length: 100 }, (_, i) => [i + 1, { id: i + 1, name: `user ${i + 1}` }]))) {
  const calls = [];
  const batchFn = async (keys) => {
    calls.push([...keys]);
    // Like `select … where id = any($1)`: rows come back in whatever order,
    // and missing ids are simply absent.
    const found = keys.filter((k) => table.has(k)).reverse();
    return new Map(found.map((k) => [k, table.get(k)]));
  };
  return { batchFn, calls, table };
}

/** Settles every load and returns what each did, without letting one rejection hide the others. */
const settle = (promises) => Promise.allSettled(promises);

/** A promise plus its resolver, for batchFns the test releases by hand. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

describe('batching', () => {
  it('turns 50 load() calls in the same tick into one batchFn call', async () => {
    const { batchFn, calls } = usersBatch();
    const loader = solution.createLoader(batchFn);
    const keys = Array.from({ length: 50 }, (_, i) => i + 1);
    const users = await Promise.all(keys.map((k) => loader.load(k)));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(keys);
    expect(users.map((u) => u.id)).toEqual(keys);
  });

  it('does not call batchFn synchronously inside load()', async () => {
    const { batchFn, calls } = usersBatch();
    const loader = solution.createLoader(batchFn);
    const p = loader.load(1);
    expect(calls).toHaveLength(0);
    await p;
    expect(calls).toHaveLength(1);
  });

  it('includes loads made after awaiting already-settled promises in the same batch', async () => {
    const { batchFn, calls } = usersBatch();
    const loader = solution.createLoader(batchFn);
    const deep = async (key, depth) => {
      for (let i = 0; i < depth; i++) await null;
      return loader.load(key);
    };
    const users = await Promise.all([loader.load(1), deep(2, 1), deep(3, 3), deep(4, 10)]);
    expect(calls).toEqual([[1, 2, 3, 4]]);
    expect(users.map((u) => u.id)).toEqual([1, 2, 3, 4]);
  });

  it('starts a new batch for loads made after the first batch was dispatched', async () => {
    const release = deferred();
    const started = deferred();
    const calls = [];
    const loader = solution.createLoader(async (keys) => {
      calls.push([...keys]);
      if (calls.length === 1) {
        started.resolve();
        await release.promise;
      }
      return new Map(keys.map((k) => [k, `v${k}`]));
    });
    const first = [loader.load(1), loader.load(2)];
    await started.promise; // batch 1 is in flight
    const late = loader.load(3);
    release.resolve();
    expect(await Promise.all([...first, late])).toEqual(['v1', 'v2', 'v3']);
    expect(calls).toEqual([[1, 2], [3]]);
  });

  it('keeps no cache: loading a key again after its batch settled calls batchFn again', async () => {
    const { batchFn, calls } = usersBatch();
    const loader = solution.createLoader(batchFn);
    await loader.load(7);
    await loader.load(7);
    expect(calls).toEqual([[7], [7]]);
  });

  it('splits a batch into chunks of maxBatchSize, in key order', async () => {
    const { batchFn, calls } = usersBatch();
    const loader = solution.createLoader(batchFn, { maxBatchSize: 20 });
    const keys = Array.from({ length: 50 }, (_, i) => i + 1);
    const users = await Promise.all(keys.map((k) => loader.load(k)));
    expect(calls.map((c) => c.length)).toEqual([20, 20, 10]);
    expect(calls.flat()).toEqual(keys);
    expect(users.map((u) => u.id)).toEqual(keys);
  });
});

describe('keys and results', () => {
  it('passes keys to batchFn in first-request order, deduplicated', async () => {
    const { batchFn, calls } = usersBatch();
    const loader = solution.createLoader(batchFn);
    await Promise.all([5, 3, 9, 3, 5, 1].map((k) => loader.load(k)));
    expect(calls).toEqual([[5, 3, 9, 1]]);
  });

  it('resolves every duplicate load to the same value', async () => {
    const { batchFn } = usersBatch();
    const loader = solution.createLoader(batchFn);
    const [a, b, c] = await Promise.all([loader.load(4), loader.load(4), loader.load(4)]);
    expect(a.id).toBe(4);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('treats 1 and "1" as different keys', async () => {
    const calls = [];
    const loader = solution.createLoader(async (keys) => {
      calls.push([...keys]);
      return new Map(keys.map((k) => [k, typeof k]));
    });
    expect(await Promise.all([loader.load(1), loader.load('1')])).toEqual(['number', 'string']);
    expect(calls).toEqual([[1, '1']]);
  });

  it('gives each load its own value even when the Map comes back in another order', async () => {
    const { batchFn } = usersBatch();
    const loader = solution.createLoader(batchFn);
    const users = await Promise.all([10, 20, 30].map((k) => loader.load(k)));
    expect(users.map((u) => u.name)).toEqual(['user 10', 'user 20', 'user 30']);
  });

  it('resolves a missing key to null without failing the rest of the batch', async () => {
    const { batchFn, calls } = usersBatch();
    const loader = solution.createLoader(batchFn);
    const results = await settle([loader.load(1), loader.load(999), loader.load(2)]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    expect(results[0].value.id).toBe(1);
    expect(results[1].value).toBeNull();
    expect(results[2].value.id).toBe(2);
    expect(calls).toHaveLength(1);
  });

  it('rejects only the load whose Map value is an Error', async () => {
    const notAllowed = new Error('user 2 is not visible to you');
    const loader = solution.createLoader(async (keys) =>
      new Map(keys.map((k) => [k, k === 2 ? notAllowed : { id: k }])));
    const results = await settle([loader.load(1), loader.load(2), loader.load(3)]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(results[1].reason).toBe(notAllowed);
    expect(results[0].value).toEqual({ id: 1 });
    expect(results[2].value).toEqual({ id: 3 });
  });
});

describe('when batchFn fails', () => {
  it('rejects every load in the batch when batchFn rejects', async () => {
    const down = new Error('database unavailable');
    const loader = solution.createLoader(async () => { throw down; });
    const results = await settle([1, 2, 3].map((k) => loader.load(k)));
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected']);
    for (const r of results) expect(r.reason).toBe(down);
  });

  it('rejects every load (and does not throw from load) when batchFn throws synchronously', async () => {
    const bug = new TypeError('cannot read properties of undefined');
    const loader = solution.createLoader(() => { throw bug; });
    let promises;
    expect(() => { promises = [loader.load(1), loader.load(2)]; }).not.toThrow();
    const results = await settle(promises);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    for (const r of results) expect(r.reason).toBe(bug);
  });

  it('rejects every load with a TypeError when batchFn does not return a Map', async () => {
    for (const bad of [[{ id: 1 }, { id: 2 }], { 1: 'a', 2: 'b' }, undefined]) {
      const loader = solution.createLoader(async () => bad);
      const results = await settle([loader.load(1), loader.load(2)]);
      expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
      for (const r of results) expect(r.reason).toBeInstanceOf(TypeError);
    }
  });

  it('keeps working after a failed batch', async () => {
    let fail = true;
    const loader = solution.createLoader(async (keys) => {
      if (fail) { fail = false; throw new Error('blip'); }
      return new Map(keys.map((k) => [k, k * 10]));
    });
    await settle([loader.load(1)]);
    expect(await loader.load(2)).toBe(20);
  });
});

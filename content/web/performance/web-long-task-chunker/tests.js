const { processInChunks } = solution;

/**
 * A fake main thread. `fn` spends `costs[i]` ms of fake time on item i;
 * each yield records how many items had been processed and lets `yieldCost`
 * ms pass (other work running).
 */
function harness(costs, { budgetMs = 50, yieldCost = 5 } = {}) {
  let t = 1000;
  const now = () => t;
  const calls = [];
  const yields = [];
  const fn = (item, index) => {
    calls.push([item, index]);
    t += costs[index];
    return item * 2;
  };
  const yieldToMain = async () => {
    yields.push(calls.length);
    t += yieldCost;
  };
  return { now, fn, yieldToMain, calls, yields, budgetMs, items: costs.map((_, i) => i + 1) };
}

const run = (h, extra = {}) =>
  processInChunks(h.items, h.fn, { budgetMs: h.budgetMs, now: h.now, yieldToMain: h.yieldToMain, ...extra });

describe('results', () => {
  it('returns fn(item, index) for every item, in order', async () => {
    const h = harness([1, 1, 1]);
    expect(await run(h)).toEqual([2, 4, 6]);
    expect(h.calls).toEqual([[1, 0], [2, 1], [3, 2]]);
  });

  it('resolves [] for no items without yielding', async () => {
    const h = harness([]);
    expect(await run(h)).toEqual([]);
    expect(h.yields).toEqual([]);
  });
});

describe('yielding on time', () => {
  it('yields before the item that would start once the budget is used up', async () => {
    const h = harness([20, 20, 20, 20, 20, 20]);
    await run(h);
    expect(h.yields).toEqual([3]);
  });

  it('treats reaching the budget exactly as used up', async () => {
    const h = harness([25, 25, 25]);
    await run(h);
    expect(h.yields).toEqual([2]);
  });

  it('follows the cost, not the item count', async () => {
    const h = harness([1, 1, 1, 60, 1, 1, 49, 1, 1]);
    await run(h);
    expect(h.yields).toEqual([4, 7]);
  });

  it('processes at least one item per slice, even when one item is over budget', async () => {
    const h = harness([200, 200, 1]);
    expect(await run(h)).toEqual([2, 4, 6]);
    expect(h.yields).toEqual([1, 2]);
  });

  it('never yields after the last item', async () => {
    const h = harness([10, 100]);
    await run(h);
    expect(h.yields).toEqual([]);
  });

  it('starts a new slice after the yield, so time spent elsewhere does not count', async () => {
    const h = harness([30, 30, 30, 30], { yieldCost: 1000 });
    await run(h);
    expect(h.yields).toEqual([2]);
  });

  it('uses the budget it is given', async () => {
    const h = harness([10, 10, 10, 10, 10], { budgetMs: 20 });
    await run(h);
    expect(h.yields).toEqual([2, 4]);
  });

  it('really waits for yieldToMain', async () => {
    const h = harness([60, 1, 1]);
    let release;
    const result = processInChunks(h.items, h.fn, {
      now: h.now,
      yieldToMain: () => new Promise((r) => { release = r; }),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(h.calls).toHaveLength(1);
    release();
    expect(await result).toEqual([2, 4, 6]);
  });
});

describe('failure and cancellation', () => {
  it('rejects with the reason of an already-aborted signal without calling fn', async () => {
    const h = harness([1, 1]);
    const controller = new AbortController();
    const reason = new Error('navigated away');
    controller.abort(reason);
    let error;
    try { await run(h, { signal: controller.signal }); } catch (e) { error = e; }
    expect(error).toBe(reason);
    expect(h.calls).toEqual([]);
  });

  it('stops at the next yield when aborted mid-way', async () => {
    const h = harness([30, 30, 30, 30, 30]);
    const controller = new AbortController();
    const reason = new Error('stop');
    const inner = h.fn;
    h.fn = (item, index) => {
      if (index === 1) controller.abort(reason);
      return inner(item, index);
    };
    let error;
    try { await run(h, { signal: controller.signal }); } catch (e) { error = e; }
    expect(error).toBe(reason);
    expect(h.calls).toHaveLength(2);
    expect(h.yields).toEqual([2]);
  });

  it('rejects with fn\'s error and processes nothing more', async () => {
    const h = harness([1, 1, 1, 1]);
    const boom = new Error('bad row');
    const inner = h.fn;
    h.fn = (item, index) => {
      if (index === 1) throw boom;
      return inner(item, index);
    };
    let error;
    try { await run(h); } catch (e) { error = e; }
    expect(error).toBe(boom);
    expect(h.calls).toHaveLength(1);
  });
});

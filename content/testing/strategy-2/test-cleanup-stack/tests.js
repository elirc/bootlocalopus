const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createCleanup: run', () => {
  it('runs steps last-registered-first', async () => {
    const order = [];
    const c = solution.createCleanup();
    c.defer(() => order.push('close db'));
    c.defer(() => order.push('stop server'));
    c.defer(() => order.push('delete temp dir'));
    await c.run();
    expect(order).toEqual(['delete temp dir', 'stop server', 'close db']);
  });

  it('awaits each async step before starting the next', async () => {
    const events = [];
    const c = solution.createCleanup();
    c.defer(async () => { events.push('A start'); await tick(); events.push('A end'); });
    c.defer(async () => { events.push('B start'); await tick(); events.push('B end'); });
    await c.run();
    expect(events).toEqual(['B start', 'B end', 'A start', 'A end']);
  });

  it('keeps going after a step throws or rejects, then rejects with every failure', async () => {
    const ran = [];
    const c = solution.createCleanup();
    c.defer(() => { ran.push(1); });
    c.defer(async () => { ran.push(2); throw new Error('port still bound'); });
    c.defer(() => { ran.push(3); });
    c.defer(() => { ran.push(4); throw new Error('temp dir busy'); });
    let caught;
    try {
      await c.run();
    } catch (error) {
      caught = error;
    }
    expect(ran).toEqual([4, 3, 2, 1]);
    expect(caught).toBeInstanceOf(AggregateError);
    expect(caught.message).toBe('2 cleanup step(s) failed');
    expect(caught.errors.map((e) => e.message)).toEqual(['temp dir busy', 'port still bound']);
  });

  it('resolves when every step succeeds, and when there are none', async () => {
    const c = solution.createCleanup();
    await expect(c.run()).resolves.toBeUndefined();
    c.defer(() => 'ignored');
    await expect(c.run()).resolves.toBeUndefined();
  });

  it('empties the stack: a second run does not repeat steps', async () => {
    let n = 0;
    const c = solution.createCleanup();
    c.defer(() => { n++; });
    await c.run();
    await c.run();
    expect(n).toBe(1);
  });

  it('runs a step deferred during the run next, in the same run', async () => {
    const order = [];
    const c = solution.createCleanup();
    c.defer(() => order.push('old'));
    c.defer(() => {
      order.push('outer');
      c.defer(() => order.push('added during run'));
    });
    await c.run();
    expect(order).toEqual(['outer', 'added during run', 'old']);
  });
});

describe('createCleanup: defer', () => {
  it('returns a function that cancels that step only', async () => {
    const order = [];
    const c = solution.createCleanup();
    c.defer(() => order.push('a'));
    const cancelB = c.defer(() => order.push('b'));
    c.defer(() => order.push('c'));
    cancelB();
    cancelB(); // cancelling twice is harmless
    await c.run();
    expect(order).toEqual(['c', 'a']);
  });

  it('cancels the right registration when the same function is deferred twice', async () => {
    const order = [];
    const step = () => order.push('step');
    const other = () => order.push('other');

    const first = solution.createCleanup();
    first.defer(step);
    first.defer(other);
    first.defer(step)(); // cancel the later registration
    await first.run();
    expect(order).toEqual(['other', 'step']);

    order.length = 0;
    const second = solution.createCleanup();
    const cancelEarlier = second.defer(step);
    second.defer(other);
    second.defer(step);
    cancelEarlier();
    await second.run();
    expect(order).toEqual(['step', 'other']);
  });

  it('throws a TypeError straight away for a non-function', () => {
    const c = solution.createCleanup();
    expect(() => c.defer('close')).toThrow(TypeError);
  });
});

describe('withCleanup', () => {
  it('returns what the body returns, after running its cleanups', async () => {
    const order = [];
    const value = await solution.withCleanup(async (defer) => {
      defer(() => order.push('cleanup'));
      order.push('body');
      return 42;
    });
    expect(value).toBe(42);
    expect(order).toEqual(['body', 'cleanup']);
  });

  it('still runs the cleanups when the body throws, and rethrows the body\'s error', async () => {
    const ran = [];
    const failure = new Error('assertion failed');
    let caught;
    try {
      await solution.withCleanup(async (defer) => {
        defer(() => ran.push('a'));
        defer(() => { ran.push('b'); throw new Error('cleanup failed too'); });
        throw failure;
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
    expect(ran).toEqual(['b', 'a']);
  });

  it('rejects with the AggregateError when only a cleanup fails', async () => {
    const run = solution.withCleanup(async (defer) => {
      defer(() => { throw new Error('leaked handle'); });
      return 'ok';
    });
    await expect(run).rejects.toThrow('1 cleanup step(s) failed');
  });
});

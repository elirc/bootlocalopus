const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

/** Tasks that record when they start and wait for the test to finish them. */
function tracker() {
  const started = [];
  const handles = new Map();
  const task = (name) => () => new Promise((resolve, reject) => {
    started.push(name);
    handles.set(name, { resolve, reject });
  });
  const finish = async (name, value = name) => { handles.get(name).resolve(value); await flush(); };
  const failTask = async (name, error) => { handles.get(name).reject(error); await flush(); };
  return { started, task, finish, failTask };
}

const outcome = (p) => p.then((value) => ({ value }), (error) => ({ error }));

describe('ordering per key', () => {
  it('runs one task per key at a time, in submission order', async () => {
    const r = solution.createKeyedRunner({ concurrency: 4 });
    const t = tracker();
    const p1 = r.run('cus_1', t.task('created'));
    const p2 = r.run('cus_1', t.task('updated'));
    const p3 = r.run('cus_1', t.task('cancelled'));
    await flush();
    expect(t.started).toEqual(['created']);
    expect(r.running).toBe(1);
    expect(r.pending).toBe(2);
    await t.finish('created');
    expect(t.started).toEqual(['created', 'updated']);
    await t.finish('updated');
    await t.finish('cancelled');
    expect(await Promise.all([p1, p2, p3])).toEqual(['created', 'updated', 'cancelled']);
  });

  it('runs different keys in parallel', async () => {
    const r = solution.createKeyedRunner({ concurrency: 4 });
    const t = tracker();
    r.run('a', t.task('a1'));
    r.run('b', t.task('b1'));
    r.run('c', t.task('c1'));
    await flush();
    expect(t.started).toEqual(['a1', 'b1', 'c1']);
    expect(r.running).toBe(3);
  });

  it('distinguishes keys by Map semantics', async () => {
    const r = solution.createKeyedRunner();
    const t = tracker();
    r.run('1', t.task('string'));
    r.run(1, t.task('number'));
    await flush();
    expect(t.started).toEqual(['string', 'number']);
  });
});

describe('the concurrency cap', () => {
  it('never runs more than `concurrency` tasks, and refills in order', async () => {
    const r = solution.createKeyedRunner({ concurrency: 2 });
    const t = tracker();
    for (const k of ['a', 'b', 'c', 'd']) r.run(k, t.task(k));
    await flush();
    expect(t.started).toEqual(['a', 'b']);
    expect(r.pending).toBe(2);
    await t.finish('b');
    expect(t.started).toEqual(['a', 'b', 'c']);
    await t.finish('a');
    expect(t.started).toEqual(['a', 'b', 'c', 'd']);
  });

  it('defaults to 4 and validates the option', async () => {
    const r = solution.createKeyedRunner();
    const t = tracker();
    for (let i = 0; i < 6; i++) r.run('k' + i, t.task('k' + i));
    await flush();
    expect(r.running).toBe(4);
    for (const bad of [0, -1, 1.5, '2', NaN]) {
      expect(() => solution.createKeyedRunner({ concurrency: bad })).toThrow(RangeError);
    }
  });
});

describe('head-of-line blocking', () => {
  it('skips a pending task whose key is busy and starts a later one', async () => {
    const r = solution.createKeyedRunner({ concurrency: 2 });
    const t = tracker();
    r.run('cus_1', t.task('1a'));
    r.run('cus_1', t.task('1b'));          // must wait for 1a
    r.run('cus_2', t.task('2a'));          // a free slot and a free key: starts now
    await flush();
    expect(t.started).toEqual(['1a', '2a']);
  });

  it('when a slot frees, starts the oldest task whose key is free', async () => {
    const r = solution.createKeyedRunner({ concurrency: 2 });
    const t = tracker();
    r.run('a', t.task('a1'));
    r.run('b', t.task('b1'));
    r.run('a', t.task('a2'));
    r.run('b', t.task('b2'));
    r.run('c', t.task('c1'));
    await flush();
    expect(t.started).toEqual(['a1', 'b1']);
    await t.finish('b1');                  // a2 is older but 'a' is busy: b2 is next
    expect(t.started).toEqual(['a1', 'b1', 'b2']);
    await t.finish('a1');
    expect(t.started).toEqual(['a1', 'b1', 'b2', 'a2']);
    await t.finish('b2');
    expect(t.started).toEqual(['a1', 'b1', 'b2', 'a2', 'c1']);
  });
});

describe('failures', () => {
  it('rejects only the failing task; its key carries on', async () => {
    const r = solution.createKeyedRunner({ concurrency: 1 });
    const t = tracker();
    const bad = outcome(r.run('k', t.task('bad')));
    const good = r.run('k', t.task('good'));
    await flush();
    const err = new Error('handler failed');
    await t.failTask('bad', err);
    expect((await bad).error).toBe(err);
    await t.finish('good', 'ok');
    expect(await good).toBe('ok');
  });

  it('turns a synchronous throw into a rejection', async () => {
    const r = solution.createKeyedRunner();
    let p;
    expect(() => { p = r.run('k', () => { throw new Error('sync'); }); }).not.toThrow();
    expect((await outcome(p)).error.message).toBe('sync');
    expect(await r.run('k', () => 'next')).toBe('next');
  });
});

describe('bookkeeping', () => {
  it('forgets keys once their work is done', async () => {
    const r = solution.createKeyedRunner({ concurrency: 2 });
    const t = tracker();
    r.run('a', t.task('a1'));
    r.run('a', t.task('a2'));
    r.run('b', t.task('b1'));
    r.run('c', t.task('c1'));
    await flush();
    expect(r.activeKeys).toBe(3);         // a (running + pending), b (running), c (pending)
    await t.finish('a1');
    expect(r.activeKeys).toBe(3);         // a2 still pending for 'a'
    await t.finish('b1');
    expect(r.activeKeys).toBe(2);
    await t.finish('a2');
    await t.finish('c1');
    expect(r.activeKeys).toBe(0);

    const all = [];
    for (let i = 0; i < 50; i++) all.push(r.run('key-' + i, async () => i));
    await Promise.all(all);
    expect(r.activeKeys).toBe(0);
  });

  it('onIdle resolves at once when idle and after the last task otherwise', async () => {
    const r = solution.createKeyedRunner({ concurrency: 1 });
    await r.onIdle();
    const t = tracker();
    r.run('a', t.task('a1'));
    r.run('a', t.task('a2'));
    let idle = false;
    r.onIdle().then(() => { idle = true; });
    await flush();
    await t.finish('a1');
    expect(idle).toBe(false);
    await t.finish('a2');
    expect(idle).toBe(true);
    expect(r.activeKeys).toBe(0);
    expect(r.running).toBe(0);
    expect(r.pending).toBe(0);
  });
});

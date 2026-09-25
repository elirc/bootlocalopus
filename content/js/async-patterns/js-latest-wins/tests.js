const { latestOnly, SupersededError } = solution;
const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// A fake search API whose responses the test releases in any order.
function fakeApi() {
  const calls = [];
  const fn = (query, { signal }) => {
    const d = deferred();
    calls.push({ query, signal, ...d });
    return d.promise;
  };
  return { fn, calls };
}

// Settle state of a promise without awaiting it forever.
function track(p) {
  const s = { state: 'pending' };
  p.then((v) => { s.state = 'fulfilled'; s.value = v; }, (e) => { s.state = 'rejected'; s.error = e; });
  return s;
}

describe('SupersededError', () => {
  it('is an Error named SupersededError', () => {
    const e = new SupersededError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('SupersededError');
  });
});

describe('latestOnly', () => {
  it('passes the arguments plus a signal and delivers the result', async () => {
    const run = latestOnly(async (a, b, { signal }) => `${a}+${b}:${signal.aborted}`);
    expect(await run(1, 2)).toBe('1+2:false');
  });

  it('an old response arriving late is never delivered', async () => {
    const api = fakeApi();
    const search = latestOnly(api.fn);
    const re = track(search('re'));
    const react = track(search('react'));
    await tick();
    api.calls[1].resolve(['react']);
    api.calls[0].resolve(['re', 'redux', 'regex']);
    await tick();
    expect(react).toEqual({ state: 'fulfilled', value: ['react'] });
    expect(re.state).toBe('rejected');
    expect(re.error).toBeInstanceOf(SupersededError);
  });

  it('rejects a superseded call even if its fn ignores the signal and resolves', async () => {
    const api = fakeApi();
    const search = latestOnly(api.fn);
    const first = track(search('a'));
    search('ab').catch(() => {});
    await tick();
    expect(first.state).toBe('rejected');
    expect(first.error).toBeInstanceOf(SupersededError);
    api.calls[0].resolve('stale');
    await tick();
    expect(first.error).toBeInstanceOf(SupersededError);
  });

  it('a superseded call rejects with SupersededError, not with its own error', async () => {
    const api = fakeApi();
    const search = latestOnly(api.fn);
    const first = track(search('a'));
    const second = track(search('ab'));
    await tick();
    api.calls[0].reject(new Error('network down'));
    api.calls[1].resolve('ok');
    await tick();
    expect(first.error).toBeInstanceOf(SupersededError);
    expect(second).toEqual({ state: 'fulfilled', value: 'ok' });
  });

  it('aborts the previous signal with a SupersededError reason', async () => {
    const api = fakeApi();
    const search = latestOnly(api.fn);
    search('a').catch(() => {});
    await tick();
    const firstSignal = api.calls[0].signal;
    expect(firstSignal.aborted).toBe(false);
    search('ab').catch(() => {});
    await tick();
    expect(firstSignal.aborted).toBe(true);
    expect(firstSignal.reason).toBeInstanceOf(SupersededError);
    expect(api.calls[1].signal.aborted).toBe(false);
  });

  it('does not abort a call that already finished', async () => {
    const api = fakeApi();
    const search = latestOnly(api.fn);
    const p = search('a');
    await tick();
    api.calls[0].resolve('done');
    expect(await p).toBe('done');
    search('b').catch(() => {});
    await tick();
    expect(api.calls[0].signal.aborted).toBe(false);
  });

  it('the latest call still rejects with its own error', async () => {
    const run = latestOnly(async () => { throw new Error('400 bad query'); });
    await expect(run('x')).rejects.toThrow('400 bad query');
  });

  it('turns a synchronous throw into a rejection', async () => {
    const run = latestOnly(() => { throw new TypeError('sync'); });
    let p;
    expect(() => { p = run(); }).not.toThrow();
    await expect(p).rejects.toThrow('sync');
  });
});

describe('cancel', () => {
  it('supersedes the pending call without starting another', async () => {
    const api = fakeApi();
    const search = latestOnly(api.fn);
    const p = track(search('a'));
    await tick();
    search.cancel();
    await tick();
    expect(p.state).toBe('rejected');
    expect(p.error).toBeInstanceOf(SupersededError);
    expect(api.calls[0].signal.aborted).toBe(true);
    expect(api.calls).toHaveLength(1);
  });

  it('is harmless with nothing pending, and the wrapper keeps working', async () => {
    const run = latestOnly(async (x) => x * 2);
    run.cancel();
    expect(await run(21)).toBe(42);
    run.cancel();
    expect(await run(4)).toBe(8);
  });
});

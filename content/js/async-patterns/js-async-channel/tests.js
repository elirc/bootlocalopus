const { Channel } = solution;
const tick = () => new Promise((r) => setTimeout(r, 0));

function track(p) {
  const s = { state: 'pending' };
  p.then((v) => { s.state = 'fulfilled'; s.value = v; }, (e) => { s.state = 'rejected'; s.error = e; });
  return s;
}

describe('push and pull', () => {
  it('buffers values pushed before anyone reads, in order', async () => {
    const ch = new Channel();
    ch.push('a');
    ch.push('b');
    expect(ch.size).toBe(2);
    expect(await ch.next()).toEqual({ value: 'a', done: false });
    expect(await ch.next()).toEqual({ value: 'b', done: false });
    expect(ch.size).toBe(0);
  });

  it('a waiting reader receives the next push', async () => {
    const ch = new Channel();
    const p = track(ch.next());
    await tick();
    expect(p.state).toBe('pending');
    ch.push(42);
    await tick();
    expect(p).toEqual({ state: 'fulfilled', value: { value: 42, done: false } });
    expect(ch.size).toBe(0);
  });

  it('serves several concurrent next() calls in order', async () => {
    const ch = new Channel();
    const a = ch.next();
    const b = ch.next();
    const c = ch.next();
    ch.push(1);
    ch.push(2);
    ch.push(3);
    expect(await Promise.all([a, b, c])).toEqual([
      { value: 1, done: false },
      { value: 2, done: false },
      { value: 3, done: false },
    ]);
  });

  it('works with for await, including falsy values', async () => {
    const ch = new Channel();
    const got = [];
    const consumer = (async () => { for await (const v of ch) got.push(v); })();
    for (const v of [0, '', null, false, 'x']) {
      ch.push(v);
      await tick();
    }
    ch.close();
    await consumer;
    expect(got).toEqual([0, '', null, false, 'x']);
  });

  it('returns itself from Symbol.asyncIterator', () => {
    const ch = new Channel();
    expect(ch[Symbol.asyncIterator]()).toBe(ch);
  });
});

describe('backpressure', () => {
  it('push returns false once the buffer reaches highWaterMark, but keeps the value', async () => {
    const ch = new Channel({ highWaterMark: 2 });
    expect(ch.push(1)).toBe(true);
    expect(ch.push(2)).toBe(false);
    expect(ch.push(3)).toBe(false);
    expect(ch.size).toBe(3);
    await ch.next();
    await ch.next();
    expect(ch.push(4)).toBe(false);
    await ch.next();
    await ch.next();
    expect(ch.push(5)).toBe(true);
  });

  it('a push handed straight to a waiting reader does not fill the buffer', () => {
    const ch = new Channel({ highWaterMark: 1 });
    ch.next();
    expect(ch.push('direct')).toBe(true);
    expect(ch.size).toBe(0);
  });
});

describe('close and fail', () => {
  it('close delivers buffered values before done', async () => {
    const ch = new Channel();
    ch.push('last words');
    ch.close();
    expect(await ch.next()).toEqual({ value: 'last words', done: false });
    expect(await ch.next()).toEqual({ value: undefined, done: true });
    expect(await ch.next()).toEqual({ value: undefined, done: true });
  });

  it('close ends waiting readers', async () => {
    const ch = new Channel();
    const a = ch.next();
    const b = ch.next();
    ch.close();
    expect(await a).toEqual({ value: undefined, done: true });
    expect(await b).toEqual({ value: undefined, done: true });
  });

  it('push after close throws', () => {
    const ch = new Channel();
    ch.close();
    expect(() => ch.push(1)).toThrow();
  });

  it('fail rejects once the buffer is drained, then is done', async () => {
    const ch = new Channel();
    ch.push(1);
    ch.fail(new Error('socket reset'));
    expect(await ch.next()).toEqual({ value: 1, done: false });
    await expect(ch.next()).rejects.toThrow('socket reset');
    expect(await ch.next()).toEqual({ value: undefined, done: true });
    expect(() => ch.push(2)).toThrow();
  });

  it('fail rejects a reader that is already waiting', async () => {
    const ch = new Channel();
    const p = ch.next();
    ch.fail(new Error('upstream gone'));
    await expect(p).rejects.toThrow('upstream gone');
  });

  it('for await surfaces a failure as a throw', async () => {
    const ch = new Channel();
    const got = [];
    ch.push('a');
    ch.fail(new Error('boom'));
    let caught;
    try {
      for await (const v of ch) got.push(v);
    } catch (e) {
      caught = e;
    }
    expect(got).toEqual(['a']);
    expect(caught && caught.message).toBe('boom');
  });
});

describe('consumer cancellation', () => {
  it('break calls onCancel once, clears the buffer and drops later pushes', async () => {
    let cancels = 0;
    const ch = new Channel({ onCancel: () => { cancels++; } });
    ch.push(1);
    ch.push(2);
    ch.push(3);
    for await (const v of ch) {
      if (v === 1) break;
    }
    expect(cancels).toBe(1);
    expect(ch.size).toBe(0);
    expect(ch.push(4)).toBe(false);
    expect(ch.size).toBe(0);
    expect(await ch.next()).toEqual({ value: undefined, done: true });
    await ch.return();
    expect(cancels).toBe(1);
  });

  it('return resolves waiting readers with done', async () => {
    const ch = new Channel();
    const p = ch.next();
    expect(await ch.return()).toEqual({ value: undefined, done: true });
    expect(await p).toEqual({ value: undefined, done: true });
  });

  it('does not call onCancel when the producer already closed', async () => {
    let cancels = 0;
    const ch = new Channel({ onCancel: () => { cancels++; } });
    ch.push('a');
    ch.push('b');
    ch.close();
    for await (const v of ch) {
      if (v === 'a') break;
    }
    expect(cancels).toBe(0);
  });
});

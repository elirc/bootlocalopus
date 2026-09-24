describe('Emitter basics', () => {
  it('delivers to subscribers with arguments', () => {
    const e = new solution.Emitter();
    const seen = [];
    e.on('tick', (a, b) => seen.push([a, b]));
    expect(e.emit('tick', 1, 2)).toBe(1);
    expect(seen).toEqual([[1, 2]]);
  });
  it('delivers in subscription order', () => {
    const e = new solution.Emitter();
    const order = [];
    e.on('x', () => order.push('first'));
    e.on('x', () => order.push('second'));
    e.on('x', () => order.push('third'));
    e.emit('x');
    expect(order).toEqual(['first', 'second', 'third']);
  });
  it('emitting an unknown event is a no-op returning 0', () => {
    const e = new solution.Emitter();
    expect(e.emit('nobody-home')).toBe(0);
  });
  it('counts listeners', () => {
    const e = new solution.Emitter();
    const h = () => {};
    e.on('a', h);
    e.on('a', () => {});
    expect(e.listenerCount('a')).toBe(2);
    expect(e.listenerCount('b')).toBe(0);
  });
});

describe('unsubscribing', () => {
  it('on() returns a working unsubscribe', () => {
    const e = new solution.Emitter();
    let calls = 0;
    const stop = e.on('a', () => calls++);
    e.emit('a');
    stop();
    e.emit('a');
    expect(calls).toBe(1);
    expect(e.listenerCount('a')).toBe(0);
  });
  it('off() removes only the given handler', () => {
    const e = new solution.Emitter();
    const seen = [];
    const keep = () => seen.push('keep');
    const drop = () => seen.push('drop');
    e.on('a', keep);
    e.on('a', drop);
    e.off('a', drop);
    e.emit('a');
    expect(seen).toEqual(['keep']);
  });
  it('once() fires exactly one time', () => {
    const e = new solution.Emitter();
    let calls = 0;
    e.once('boot', () => calls++);
    e.emit('boot');
    e.emit('boot');
    expect(calls).toBe(1);
    expect(e.listenerCount('boot')).toBe(0);
  });
  it('off() can cancel a once() handler before it fires', () => {
    const e = new solution.Emitter();
    let calls = 0;
    const h = () => calls++;
    e.once('boot', h);
    e.off('boot', h);
    e.emit('boot');
    expect(calls).toBe(0);
  });
  it('unsubscribing during emit does not skip the next handler', () => {
    const e = new solution.Emitter();
    const seen = [];
    const a = () => { seen.push('a'); e.off('x', b); };
    const b = () => seen.push('b');
    const c = () => seen.push('c');
    e.on('x', a);
    e.on('x', b);
    e.on('x', c);
    e.emit('x');
    // b was already in the snapshot; c must still run.
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(e.listenerCount('x')).toBe(2);
  });

  it('a handler subscribed during emit waits for the next emit', () => {
    const e = new solution.Emitter();
    const seen = [];
    e.on('x', () => { seen.push('a'); e.on('x', () => seen.push('late')); });
    e.emit('x');
    expect(seen).toEqual(['a']);
    e.emit('x');
    expect(seen).toEqual(['a', 'a', 'late']);
  });
});

describe('error isolation', () => {
  it('runs every handler even when one throws, then reports', () => {
    const e = new solution.Emitter();
    const seen = [];
    e.on('x', () => { seen.push('before'); });
    e.on('x', () => { throw new Error('handler blew up'); });
    e.on('x', () => { seen.push('after'); });
    expect(() => e.emit('x')).toThrow();
    expect(seen).toEqual(['before', 'after']);
  });
  it('throws an AggregateError carrying every failure', () => {
    const e = new solution.Emitter();
    e.on('x', () => { throw new Error('one'); });
    e.on('x', () => { throw new Error('two'); });
    let caught;
    try { e.emit('x'); } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(AggregateError);
    expect(caught.errors).toHaveLength(2);
    expect(caught.errors.map((x) => x.message)).toEqual(['one', 'two']);
  });
});

describe('no leaks', () => {
  it('drops the event entry when the last listener leaves', () => {
    const e = new solution.Emitter();
    const stop = e.on('a', () => {});
    stop();
    // Whatever the internal storage is, the count must be zero and emit a no-op.
    expect(e.listenerCount('a')).toBe(0);
    expect(e.emit('a')).toBe(0);
  });
});
import { EventEmitter, getEventListeners } from 'node:events';

const within = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
};

const tick = () => new Promise((r) => setImmediate(r));

const listeners = (emitter) => ({
  progress: emitter.listenerCount('progress'),
  done: emitter.listenerCount('done'),
  failed: emitter.listenerCount('failed'),
});
const NONE = { progress: 0, done: 0, failed: 0 };

const collect = async (iterable, stopAfter = Infinity) => {
  const seen = [];
  for await (const p of iterable) {
    seen.push(p);
    if (seen.length >= stopAfter) break;
  }
  return seen;
};

describe('watchJob', () => {
  it('yields this job\'s progress in order and finishes on done', async () => {
    const bus = new EventEmitter();
    const result = within(collect(solution.watchJob(bus, 'a')), 3000, 'the loop never finished after done');
    await tick();
    bus.emit('progress', { jobId: 'a', percent: 10 });
    bus.emit('progress', { jobId: 'b', percent: 99 });
    await tick();
    bus.emit('progress', { jobId: 'a', percent: 50 });
    bus.emit('done', { jobId: 'b' });
    await tick();
    bus.emit('progress', { jobId: 'a', percent: 100 });
    bus.emit('done', { jobId: 'a' });
    expect(await result).toEqual([10, 50, 100]);
    expect(listeners(bus)).toEqual(NONE);
  });

  it('subscribes immediately: events before the first next() are kept', async () => {
    const bus = new EventEmitter();
    const it = solution.watchJob(bus, 'a');
    bus.emit('progress', { jobId: 'a', percent: 1 });
    bus.emit('progress', { jobId: 'a', percent: 2 });
    bus.emit('done', { jobId: 'a' });
    expect(await within(collect(it), 3000, 'the loop never finished')).toEqual([1, 2]);
  });

  it('does not drop a burst of events that arrives while the consumer is busy', async () => {
    const bus = new EventEmitter();
    const seen = [];
    const done = within((async () => {
      for await (const p of solution.watchJob(bus, 'a')) {
        seen.push(p);
        await tick(); // slow consumer
      }
    })(), 3000, 'the loop never finished');
    await tick();
    for (let i = 1; i <= 20; i++) bus.emit('progress', { jobId: 'a', percent: i * 5 });
    bus.emit('done', { jobId: 'a' });
    await done;
    expect(seen).toEqual(Array.from({ length: 20 }, (_, i) => (i + 1) * 5));
  });

  it('throws the job\'s error on failed and removes its listeners', async () => {
    const bus = new EventEmitter();
    const boom = new Error('payment provider timeout');
    const result = within(collect(solution.watchJob(bus, 'a')), 3000, 'the loop never settled after failed');
    await tick();
    bus.emit('progress', { jobId: 'a', percent: 30 });
    bus.emit('failed', { jobId: 'b', error: new Error('not mine') });
    bus.emit('failed', { jobId: 'a', error: boom });
    let caught;
    try {
      await result;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(boom);
    expect(listeners(bus)).toEqual(NONE);
  });

  it('cleans up when the consumer breaks out early', async () => {
    const bus = new EventEmitter();
    const ac = new AbortController();
    const result = within(collect(solution.watchJob(bus, 'a', { signal: ac.signal }), 2), 3000, 'the loop never ended');
    await tick();
    bus.emit('progress', { jobId: 'a', percent: 10 });
    bus.emit('progress', { jobId: 'a', percent: 20 });
    bus.emit('progress', { jobId: 'a', percent: 30 });
    expect(await result).toEqual([10, 20]);
    expect(listeners(bus)).toEqual(NONE);
    expect(getEventListeners(ac.signal, 'abort')).toHaveLength(0);
  });

  it('cleans up when return() is called before iteration starts', async () => {
    const bus = new EventEmitter();
    const ac = new AbortController();
    const iterable = solution.watchJob(bus, 'a', { signal: ac.signal });
    const it = iterable[Symbol.asyncIterator]();
    await it.return();
    expect(listeners(bus)).toEqual(NONE);
    expect(getEventListeners(ac.signal, 'abort')).toHaveLength(0);
  });

  it('throws signal.reason when aborted, and cleans up', async () => {
    const bus = new EventEmitter();
    const ac = new AbortController();
    const result = within(collect(solution.watchJob(bus, 'a', { signal: ac.signal })), 3000, 'HUNG: the loop never settled after abort');
    await tick();
    bus.emit('progress', { jobId: 'a', percent: 5 });
    await tick();
    ac.abort();
    let caught;
    try {
      await result;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(ac.signal.reason);
    expect(caught.name).toBe('AbortError');
    expect(listeners(bus)).toEqual(NONE);
    expect(getEventListeners(ac.signal, 'abort')).toHaveLength(0);
  });

  it('throws at once for an already-aborted signal, leaving nothing behind', async () => {
    const bus = new EventEmitter();
    const reason = new Error('request closed');
    const signal = AbortSignal.abort(reason);
    let caught;
    try {
      await within(collect(solution.watchJob(bus, 'a', { signal })), 3000, 'HUNG: already-aborted signal was ignored');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(reason);
    expect(listeners(bus)).toEqual(NONE);
  });

  it('leaves no listeners after many watchers come and go', async () => {
    const bus = new EventEmitter();
    const warnings = [];
    const onWarning = (w) => warnings.push(w.name);
    process.on('warning', onWarning);
    try {
      for (let round = 0; round < 3; round++) {
        const runs = Array.from({ length: 8 }, (_, i) => collect(solution.watchJob(bus, `j${i}`), 1));
        await tick();
        for (let i = 0; i < 8; i++) bus.emit('progress', { jobId: `j${i}`, percent: 1 });
        await within(Promise.all(runs), 3000, 'watchers never finished');
      }
      await tick();
      expect(listeners(bus)).toEqual(NONE);
      expect(warnings).not.toContain('MaxListenersExceededWarning');
    } finally {
      process.off('warning', onWarning);
    }
  });
});

import { EventEmitter, getEventListeners } from 'node:events';

const { once } = solution;

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

async function state(promise) {
  let s = 'pending';
  promise.then(() => { s = 'fulfilled'; }, () => { s = 'rejected'; });
  await flush();
  return s;
}

async function rejection(promise) {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected the promise to reject');
}

// An emitter with only on/off, and a count of what is attached.
class TinyEmitter {
  #handlers = new Map();
  on(name, fn) {
    if (!this.#handlers.has(name)) this.#handlers.set(name, []);
    this.#handlers.get(name).push(fn);
  }
  off(name, fn) {
    const list = this.#handlers.get(name) ?? [];
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  }
  emit(name, ...args) {
    for (const fn of [...(this.#handlers.get(name) ?? [])]) fn(...args);
  }
  count() {
    let n = 0;
    for (const list of this.#handlers.values()) n += list.length;
    return n;
  }
}

const abortListeners = (signal) => getEventListeners(signal, 'abort').length;

describe('emitters', () => {
  it('resolves with the array of arguments and removes its listeners', async () => {
    const ee = new EventEmitter();
    const p = once(ee, 'ready');
    expect(await state(p)).toBe('pending');
    ee.emit('ready', 8080, 'localhost');
    expect(await p).toEqual([8080, 'localhost']);
    expect(ee.listenerCount('ready')).toBe(0);
    expect(ee.listenerCount('error')).toBe(0);
  });

  it('rejects on an error event and removes its listeners', async () => {
    const ee = new EventEmitter();
    const p = once(ee, 'ready');
    const boom = new Error('EADDRINUSE');
    ee.emit('error', boom);
    expect(await rejection(p)).toBe(boom);
    expect(ee.listenerCount('ready')).toBe(0);
    expect(ee.listenerCount('error')).toBe(0);
  });

  it('can wait for the error event itself', async () => {
    const ee = new EventEmitter();
    const p = once(ee, 'error');
    const boom = new Error('x');
    ee.emit('error', boom);
    expect(await p).toEqual([boom]);
    expect(ee.listenerCount('error')).toBe(0);
  });

  it('only the first event counts', async () => {
    const ee = new EventEmitter();
    const p = once(ee, 'data');
    ee.emit('data', 1);
    ee.emit('data', 2);
    expect(await p).toEqual([1]);
  });

  it('works with a bare on/off emitter', async () => {
    const tiny = new TinyEmitter();
    const p = once(tiny, 'message');
    expect(tiny.count()).toBeGreaterThan(0);
    tiny.emit('message', { id: 1 });
    expect(await p).toEqual([{ id: 1 }]);
    expect(tiny.count()).toBe(0);

    const q = once(tiny, 'message');
    tiny.emit('error', new Error('closed'));
    expect((await rejection(q)).message).toBe('closed');
    expect(tiny.count()).toBe(0);
  });

  it('does not pile up listeners when used in a loop', async () => {
    const ee = new EventEmitter();
    const warnings = [];
    const onWarning = (w) => warnings.push(w);
    process.on('warning', onWarning);
    try {
      for (let i = 0; i < 25; i++) {
        const p = once(ee, 'tick');
        ee.emit('tick', i);
        await p;
      }
      await new Promise((r) => setImmediate(r));
    } finally {
      process.off('warning', onWarning);
    }
    expect(ee.listenerCount('tick')).toBe(0);
    expect(ee.listenerCount('error')).toBe(0);
    expect(warnings.filter((w) => w.name === 'MaxListenersExceededWarning')).toEqual([]);
  });
});

describe('EventTarget', () => {
  it('resolves with the event object and removes its listener', async () => {
    const target = new EventTarget();
    const p = once(target, 'ping');
    const event = new Event('ping');
    target.dispatchEvent(event);
    expect(await p).toBe(event);
    expect(getEventListeners(target, 'ping')).toHaveLength(0);
  });

  it('does not treat an error event specially', async () => {
    const target = new EventTarget();
    const p = once(target, 'ping');
    target.dispatchEvent(new Event('error'));
    expect(await state(p)).toBe('pending');
    target.dispatchEvent(new Event('ping'));
    expect(await state(p)).toBe('fulfilled');
    expect(getEventListeners(target, 'ping')).toHaveLength(0);
    expect(getEventListeners(target, 'error')).toHaveLength(0);
  });

  it('works on an AbortSignal (an EventTarget itself)', async () => {
    const controller = new AbortController();
    const p = once(controller.signal, 'abort');
    controller.abort();
    const event = await p;
    expect(event.type).toBe('abort');
  });
});

describe('filter', () => {
  it('keeps waiting until the filter matches', async () => {
    const ee = new EventEmitter();
    const p = once(ee, 'reply', { filter: ([msg]) => msg.id === 2 });
    ee.emit('reply', { id: 1, body: 'not mine' });
    expect(await state(p)).toBe('pending');
    ee.emit('reply', { id: 2, body: 'mine' });
    expect(await p).toEqual([{ id: 2, body: 'mine' }]);
    expect(ee.listenerCount('reply')).toBe(0);
  });

  it('gets the event object on an EventTarget', async () => {
    const target = new EventTarget();
    const p = once(target, 'progress', { filter: (e) => e.detail === 100 });
    target.dispatchEvent(new CustomEvent('progress', { detail: 50 }));
    target.dispatchEvent(new CustomEvent('progress', { detail: 100 }));
    expect((await p).detail).toBe(100);
  });

  it('a throwing filter rejects and cleans up', async () => {
    const ee = new EventEmitter();
    const bad = new Error('filter bug');
    const p = once(ee, 'reply', { filter: () => { throw bad; } });
    ee.emit('reply', {});
    expect(await rejection(p)).toBe(bad);
    expect(ee.listenerCount('reply')).toBe(0);
    expect(ee.listenerCount('error')).toBe(0);
  });
});

describe('signal', () => {
  it('an already-aborted signal rejects without adding listeners', async () => {
    const ee = new EventEmitter();
    const controller = new AbortController();
    const reason = new Error('shutting down');
    controller.abort(reason);
    const p = once(ee, 'ready', { signal: controller.signal });
    expect(ee.listenerCount('ready')).toBe(0);
    expect(ee.listenerCount('error')).toBe(0);
    expect(await rejection(p)).toBe(reason);
  });

  it('aborting later rejects with the reason and removes every listener', async () => {
    const ee = new EventEmitter();
    const controller = new AbortController();
    const p = once(ee, 'ready', { signal: controller.signal });
    expect(abortListeners(controller.signal)).toBe(1);
    controller.abort();
    const e = await rejection(p);
    expect(e).toBe(controller.signal.reason);
    expect(e.name).toBe('AbortError');
    expect(ee.listenerCount('ready')).toBe(0);
    expect(ee.listenerCount('error')).toBe(0);
    expect(abortListeners(controller.signal)).toBe(0);
  });

  it('works with AbortSignal.timeout', async () => {
    const ee = new EventEmitter();
    const e = await rejection(once(ee, 'never', { signal: AbortSignal.timeout(5) }));
    expect(e.name).toBe('TimeoutError');
    expect(ee.listenerCount('never')).toBe(0);
  });

  it('removes its abort listener from the signal after resolving or rejecting', async () => {
    const controller = new AbortController();
    const ee = new EventEmitter();
    for (let i = 0; i < 5; i++) {
      const p = once(ee, 'tick', { signal: controller.signal });
      ee.emit('tick');
      await p;
    }
    const q = once(ee, 'tick', { signal: controller.signal });
    ee.emit('error', new Error('x'));
    await rejection(q);
    const target = new EventTarget();
    const r = once(target, 'ping', { signal: controller.signal });
    target.dispatchEvent(new Event('ping'));
    await r;
    expect(abortListeners(controller.signal)).toBe(0);
  });
});

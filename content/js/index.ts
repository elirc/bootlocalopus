import { track } from '../types.ts';

export const jsTrack = track({
  id: 'js',
  title: 'JavaScript You Actually Need',
  icon: 'JS',
  color: '#f0b429',
  weight: 1,
  blurb: 'The language mechanics that separate "it works" from "I know why it works": closures, the event loop, real concurrency control, and errors you can act on.',
  chapters: [
    /* ================================================================== */
    {
      id: 'js-closures',
      title: 'Closures & Functions',
      summary: 'Private state, function factories, and the `this` bugs that eat afternoons.',
      lessons: [
        {
          id: 'js-closure-state',
          title: 'Private state with closures',
          kind: 'js',
          xp: 50,
          why: 'Every custom hook, middleware factory, and service module you write is this pattern.',
          tags: ['closures', 'encapsulation'],
          brief: `A closure is a function plus the variables it captured where it was defined.
That capture is the only real privacy JavaScript had before \`#fields\`, and it is
still how most libraries hide their internals.

## Task

Export \`createCounter(start = 0)\` returning an object with:

- \`increment()\` — adds 1, returns the new value
- \`decrement()\` — subtracts 1, returns the new value
- \`value()\` — returns the current value

The count must **not** be reachable as a property on the returned object. Two
counters must not share state.`,
          starter: `export function createCounter(start = 0) {
  // TODO: keep the count in a closure, not on the returned object
}
`,
          hints: [
            'Declare `let count = start` inside the function, then return an object whose methods read and write it.',
            'If you write `return { count, increment }`, the count is a copy on the object — that is exactly what this lesson is testing against.',
          ],
          solution: `export function createCounter(start = 0) {
  let count = start;
  return {
    increment: () => ++count,
    decrement: () => --count,
    value: () => count,
  };
}
`,
          tests: `describe('createCounter', () => {
  it('starts at 0 by default', () => {
    expect(solution.createCounter().value()).toBe(0);
  });
  it('accepts a starting value', () => {
    expect(solution.createCounter(7).value()).toBe(7);
  });
  it('increments and decrements, returning the new value', () => {
    const c = solution.createCounter(10);
    expect(c.increment()).toBe(11);
    expect(c.increment()).toBe(12);
    expect(c.decrement()).toBe(11);
    expect(c.value()).toBe(11);
  });
  it('keeps the count private', () => {
    const c = solution.createCounter(3);
    const leaked = Object.keys(c).filter((k) => typeof c[k] !== 'function');
    expect(leaked).toEqual([]);
    expect(JSON.stringify(c)).toBe('{}');
  });
  it('gives each counter its own state', () => {
    const a = solution.createCounter();
    const b = solution.createCounter();
    a.increment();
    a.increment();
    expect(a.value()).toBe(2);
    expect(b.value()).toBe(0);
  });
});`,
        },
        {
          id: 'js-once-memoize',
          title: 'once() and memoize()',
          kind: 'js',
          xp: 60,
          why: 'Cheap wins against duplicate network calls and re-initialised singletons.',
          tags: ['closures', 'caching', 'higher-order functions'],
          brief: `Two higher-order functions you will reimplement in every codebase that
does not already have them.

## Task

Export both:

- \`once(fn)\` — calls \`fn\` at most once. Later calls return the first result
  without calling \`fn\` again. Arguments of later calls are ignored.
- \`memoize(fn, keyFn)\` — caches by key. Default key is \`JSON.stringify(args)\`.
  Expose \`.cache\` (a \`Map\`) on the returned function so callers can inspect or
  clear it.

Both must forward \`this\` correctly, so a memoized method still works when
called as \`obj.method()\`.`,
          starter: `export function once(fn) {
  // TODO
}

export function memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
  // TODO
}
`,
          hints: [
            'For `once`, track a `called` boolean plus a `result` variable — do not test `result === undefined`, because the function may legitimately return undefined.',
            'Use `function (...args)` (not an arrow) for the wrapper so `this` is inherited from the call site, then `fn.apply(this, args)`.',
            'For `memoize`, `cache.has(key)` is the check you want; `cache.get(key) !== undefined` breaks for cached undefined values.',
          ],
          solution: `export function once(fn) {
  let called = false;
  let result;
  return function (...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}

export function memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
  const cache = new Map();
  const wrapped = function (...args) {
    const key = keyFn.apply(this, args);
    if (!cache.has(key)) cache.set(key, fn.apply(this, args));
    return cache.get(key);
  };
  wrapped.cache = cache;
  return wrapped;
}
`,
          tests: `describe('once', () => {
  it('calls through exactly once', () => {
    let calls = 0;
    const init = solution.once(() => { calls++; return 'ready'; });
    expect(init()).toBe('ready');
    expect(init()).toBe('ready');
    expect(init('ignored')).toBe('ready');
    expect(calls).toBe(1);
  });
  it('caches an undefined result too', () => {
    let calls = 0;
    const f = solution.once(() => { calls++; });
    f(); f(); f();
    expect(calls).toBe(1);
  });
  it('passes through the first arguments', () => {
    const f = solution.once((a, b) => a + b);
    expect(f(2, 3)).toBe(5);
  });
  it('keeps the caller as this', () => {
    const obj = { n: 41, bump: solution.once(function () { return this.n + 1; }) };
    expect(obj.bump()).toBe(42);
  });
});

describe('memoize', () => {
  it('only computes once per distinct argument list', () => {
    let calls = 0;
    const slow = solution.memoize((a, b) => { calls++; return a * b; });
    expect(slow(3, 4)).toBe(12);
    expect(slow(3, 4)).toBe(12);
    expect(calls).toBe(1);
    expect(slow(5, 2)).toBe(10);
    expect(calls).toBe(2);
  });
  it('caches falsy and undefined results', () => {
    let calls = 0;
    const f = solution.memoize(() => { calls++; return undefined; });
    f(); f();
    expect(calls).toBe(1);
  });
  it('honours a custom key function', () => {
    let calls = 0;
    const byId = solution.memoize((user) => { calls++; return user.name; }, (user) => user.id);
    expect(byId({ id: 1, name: 'ada' })).toBe('ada');
    expect(byId({ id: 1, name: 'someone else' })).toBe('ada');
    expect(calls).toBe(1);
  });
  it('exposes the cache as a Map', () => {
    const f = solution.memoize((n) => n + 1);
    f(1);
    expect(f.cache).toBeInstanceOf(Map);
    expect(f.cache.size).toBe(1);
    f.cache.clear();
    expect(f.cache.size).toBe(0);
  });
});`,
        },
        {
          id: 'js-this-binding',
          title: 'Debug: the vanishing `this`',
          kind: 'js',
          xp: 55,
          why: 'The single most common "works in isolation, breaks as a callback" bug.',
          tags: ['this', 'debugging', 'methods'],
          brief: `\`this\` is decided by **how a function is called**, not where it was written.
Pull a method off its object and \`this\` is gone.

## Task

\`Cart.addAll\` and \`Cart.describe\` below are both broken by exactly this
problem. Fix them **without** changing \`add\` or the shape of the class, and
without switching \`items\` to a global.

\`\`\`js
cart.addAll([{ price: 5 }, { price: 6 }]);  // currently throws
[1, 2].map(cart.describe);                  // currently throws
\`\`\``,
          starter: `export class Cart {
  items = [];

  add(item) {
    this.items.push(item);
    return this;
  }

  addAll(list) {
    list.forEach(this.add);   // BUG
    return this;
  }

  describe(index) {
    return this.items[index] ? 'item @ ' + this.items[index].price : 'empty';  // BUG when detached
  }

  get total() {
    return this.items.reduce((sum, i) => sum + i.price, 0);
  }
}
`,
          hints: [
            '`forEach` takes a second argument: the `this` to use. Or wrap the call in an arrow function, which captures `this` lexically.',
            'For `describe`, a class field holding an arrow function (`describe = (index) => {...}`) is bound per instance and survives being detached.',
          ],
          solution: `export class Cart {
  items = [];

  add(item) {
    this.items.push(item);
    return this;
  }

  addAll(list) {
    // Arrow keeps the lexical \`this\`; \`list.forEach(this.add, this)\` also works.
    list.forEach((item) => this.add(item));
    return this;
  }

  // A class field is bound to the instance, so it survives detaching.
  describe = (index) => {
    return this.items[index] ? 'item @ ' + this.items[index].price : 'empty';
  };

  get total() {
    return this.items.reduce((sum, i) => sum + i.price, 0);
  }
}
`,
          tests: `describe('Cart', () => {
  it('still adds single items and chains', () => {
    const cart = new solution.Cart();
    expect(cart.add({ price: 3 })).toBe(cart);
    expect(cart.items).toHaveLength(1);
  });
  it('addAll works', () => {
    const cart = new solution.Cart();
    cart.addAll([{ price: 5 }, { price: 6 }]);
    expect(cart.items).toHaveLength(2);
    expect(cart.total).toBe(11);
  });
  it('describe survives being detached from the instance', () => {
    const cart = new solution.Cart();
    cart.addAll([{ price: 5 }, { price: 6 }]);
    const detached = cart.describe;
    expect(detached(0)).toBe('item @ 5');
    expect([0, 1].map(cart.describe)).toEqual(['item @ 5', 'item @ 6']);
  });
  it('keeps items per instance', () => {
    const a = new solution.Cart();
    const b = new solution.Cart();
    a.add({ price: 1 });
    expect(b.items).toEqual([]);
  });
  it('total is still a getter, not a method', () => {
    const cart = new solution.Cart();
    cart.add({ price: 2 });
    expect(cart.total).toBe(2);
  });
});`,
        },
        {
          id: 'js-compose-pipe',
          title: 'pipe, compose, and pipeAsync',
          kind: 'js',
          xp: 60,
          why: 'Middleware, data transforms, and validation chains are all function composition.',
          tags: ['functional', 'higher-order functions'],
          brief: `Composition turns a pile of small functions into one pipeline. Express
middleware, Redux enhancers, and unified/rehype plugins are all this idea.

## Task

Export:

- \`pipe(...fns)\` — left to right: \`pipe(a, b)(x) === b(a(x))\`
- \`compose(...fns)\` — right to left: \`compose(a, b)(x) === a(b(x))\`
- \`pipeAsync(...fns)\` — left to right, awaiting each step, so a mix of sync
  and async functions works

With no functions, all three return the input unchanged. The first function
should receive every argument passed to the pipeline.`,
          starter: `export function pipe(...fns) {
  // TODO
}

export function compose(...fns) {
  // TODO
}

export function pipeAsync(...fns) {
  // TODO
}
`,
          hints: [
            '`reduce` over the function list carrying the running value: `fns.reduce((acc, fn) => fn(acc), first)`.',
            'To let the first function take multiple arguments, seed with `fns[0](...args)` and reduce over `fns.slice(1)`.',
            'For the async version, an ordinary `for...of` loop with `value = await fn(value)` is clearer than reducing over promises.',
          ],
          solution: `export function pipe(...fns) {
  return (...args) => {
    if (fns.length === 0) return args[0];
    return fns.slice(1).reduce((acc, fn) => fn(acc), fns[0](...args));
  };
}

export function compose(...fns) {
  return pipe(...[...fns].reverse());
}

export function pipeAsync(...fns) {
  return async (...args) => {
    if (fns.length === 0) return args[0];
    let value = await fns[0](...args);
    for (const fn of fns.slice(1)) value = await fn(value);
    return value;
  };
}
`,
          tests: `const double = (n) => n * 2;
const inc = (n) => n + 1;
const str = (n) => 'n=' + n;

describe('pipe', () => {
  it('applies left to right', () => {
    expect(solution.pipe(double, inc)(5)).toBe(11);
    expect(solution.pipe(inc, double)(5)).toBe(12);
  });
  it('is the identity with no functions', () => {
    expect(solution.pipe()(42)).toBe(42);
  });
  it('passes every argument to the first function', () => {
    expect(solution.pipe((a, b) => a + b, double)(3, 4)).toBe(14);
  });
  it('composes more than two', () => {
    expect(solution.pipe(inc, double, str)(1)).toBe('n=4');
  });
});

describe('compose', () => {
  it('applies right to left', () => {
    expect(solution.compose(double, inc)(5)).toBe(12);
    expect(solution.compose(str, double, inc)(1)).toBe('n=4');
  });
  it('is the identity with no functions', () => {
    expect(solution.compose()('x')).toBe('x');
  });
});

describe('pipeAsync', () => {
  it('awaits each step', async () => {
    const load = async (id) => ({ id, tags: ['a', 'b'] });
    const count = (doc) => doc.tags.length;
    const label = async (n) => n + ' tags';
    expect(await solution.pipeAsync(load, count, label)(7)).toBe('2 tags');
  });
  it('runs steps in order, not in parallel', async () => {
    const order = [];
    const step = (name, ms) => async (v) => {
      await new Promise((r) => setTimeout(r, ms));
      order.push(name);
      return v;
    };
    await solution.pipeAsync(step('slow', 20), step('fast', 1))('x');
    expect(order).toEqual(['slow', 'fast']);
  });
  it('rejects if a step rejects', async () => {
    const boom = async () => { throw new Error('nope'); };
    await expect(solution.pipeAsync(boom, double)(1)).rejects.toThrow('nope');
  });
});`,
        },
        {
          id: 'js-event-emitter',
          title: 'BOSS: build an EventEmitter',
          kind: 'js',
          xp: 180,
          boss: true,
          why: 'Pub/sub shows up in every layer of the stack. Writing one proves you understand closures, collections, and error isolation.',
          tags: ['closures', 'pub-sub', 'error handling'],
          brief: `Time to put the chapter together. You are building the pub/sub primitive
that Node's \`EventEmitter\`, the DOM, and every state library reimplement.

## Task

Export a class \`Emitter\` with:

- \`on(event, handler)\` — subscribe; returns an \`unsubscribe()\` function
- \`once(event, handler)\` — auto-unsubscribes after the first delivery
- \`off(event, handler)\` — remove a specific handler
- \`emit(event, ...args)\` — call handlers **in subscription order**; returns
  the number of handlers called
- \`listenerCount(event)\`

Rules that matter in real code:

1. A handler that throws must not stop the other handlers. Collect the errors
   and, if any occurred, throw an \`AggregateError\` **after** all handlers ran.
2. Unsubscribing during an \`emit\` must not skip or double-call anyone — iterate
   over a snapshot.
3. No memory leaks: an event with zero listeners must not keep an empty entry.`,
          starter: `export class Emitter {
  // TODO: choose your storage. A Map of event -> array of handlers is a fine start.

  on(event, handler) {}

  once(event, handler) {}

  off(event, handler) {}

  emit(event, ...args) {}

  listenerCount(event) {}
}
`,
          hints: [
            'Store `Map<string, Function[]>`. In `emit`, copy the array first (`[...handlers]`) so mutations during iteration are safe.',
            'For `once`, wrap the handler in a function that removes itself before calling through, and make `off` able to find it — keep a reference to the original on the wrapper.',
            'Collect thrown errors in an array, and after the loop `if (errors.length) throw new AggregateError(errors, "...")`.',
            'In `off`, after removing, `if (handlers.length === 0) this.#events.delete(event)`.',
          ],
          solution: `export class Emitter {
  #events = new Map();

  on(event, handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    const list = this.#events.get(event) ?? [];
    list.push(handler);
    this.#events.set(event, list);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      handler(...args);
    };
    wrapper.original = handler;
    return this.on(event, wrapper);
  }

  off(event, handler) {
    const list = this.#events.get(event);
    if (!list) return this;
    const i = list.findIndex((h) => h === handler || h.original === handler);
    if (i !== -1) list.splice(i, 1);
    if (list.length === 0) this.#events.delete(event);
    return this;
  }

  emit(event, ...args) {
    const list = this.#events.get(event);
    if (!list || list.length === 0) return 0;
    // Snapshot: handlers may subscribe or unsubscribe while we deliver.
    const snapshot = [...list];
    const errors = [];
    for (const handler of snapshot) {
      try {
        handler(...args);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, 'one or more handlers for "' + event + '" threw');
    }
    return snapshot.length;
  }

  listenerCount(event) {
    return this.#events.get(event)?.length ?? 0;
  }
}
`,
          tests: `describe('Emitter basics', () => {
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
});`,
        },
      ],
    },

    /* ================================================================== */
    {
      id: 'js-async',
      title: 'Async, Properly',
      summary: 'The event loop, real concurrency limits, retries, and cancellation.',
      lessons: [
        {
          id: 'js-promise-parallel',
          title: 'Sequential vs parallel',
          kind: 'js',
          xp: 60,
          why: 'Awaiting in a loop is the most common accidental performance bug in Node services.',
          tags: ['async', 'promises', 'performance'],
          brief: `\`await\` inside a \`for\` loop is sequential. Ten 100 ms calls become one
second. \`Promise.all\` makes them 100 ms — but only if you start them all
before awaiting.

## Task

Export two functions, both resolving to results **in input order**:

- \`loadSequential(ids, loadOne)\` — one at a time (sometimes you need this: rate
  limits, ordering guarantees)
- \`loadParallel(ids, loadOne)\` — all at once

Then export \`settleAll(ids, loadOne)\` which never rejects: it resolves to an
array of \`{ status: 'fulfilled', value }\` or \`{ status: 'rejected', reason }\`
in input order.

Build \`settleAll\` yourself with \`.then\`/\`.catch\` — do not call
\`Promise.allSettled\`.`,
          starter: `export async function loadSequential(ids, loadOne) {
  // TODO
}

export async function loadParallel(ids, loadOne) {
  // TODO
}

export async function settleAll(ids, loadOne) {
  // TODO: implement allSettled by hand
}
`,
          hints: [
            'Parallel: `Promise.all(ids.map(loadOne))` starts every call immediately because `.map` runs synchronously.',
            'Sequential: a `for...of` loop that pushes `await loadOne(id)` into an array.',
            'For settleAll, map each id to a promise chain that resolves to a wrapper object: `.then((value) => ({ status: "fulfilled", value })).catch((reason) => ({ status: "rejected", reason }))`, then `Promise.all` the wrappers — they never reject.',
          ],
          solution: `export async function loadSequential(ids, loadOne) {
  const out = [];
  for (const id of ids) out.push(await loadOne(id));
  return out;
}

export async function loadParallel(ids, loadOne) {
  // .map runs synchronously, so every request is in flight before the await.
  return Promise.all(ids.map((id) => loadOne(id)));
}

export async function settleAll(ids, loadOne) {
  return Promise.all(
    ids.map((id) =>
      Promise.resolve()
        .then(() => loadOne(id))
        .then((value) => ({ status: 'fulfilled', value }))
        .catch((reason) => ({ status: 'rejected', reason })),
    ),
  );
}
`,
          tests: `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('loadSequential', () => {
  it('preserves order', async () => {
    const out = await solution.loadSequential([1, 2, 3], async (n) => n * 10);
    expect(out).toEqual([10, 20, 30]);
  });
  it('really is one at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    await solution.loadSequential([1, 2, 3, 4], async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight--;
      return n;
    });
    expect(peak).toBe(1);
  });
});

describe('loadParallel', () => {
  it('preserves input order regardless of completion order', async () => {
    const out = await solution.loadParallel([1, 2, 3], async (n) => {
      await sleep(n === 1 ? 30 : 1);
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30]);
  });
  it('overlaps the work', async () => {
    let inFlight = 0;
    let peak = 0;
    const started = Date.now();
    await solution.loadParallel([1, 2, 3, 4, 5], async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(25);
      inFlight--;
      return n;
    });
    expect(peak).toBe(5);
    expect(Date.now() - started).toBeLessThan(100);
  });
  it('rejects if any call rejects', async () => {
    await expect(
      solution.loadParallel([1, 2], async (n) => { if (n === 2) throw new Error('boom'); return n; }),
    ).rejects.toThrow('boom');
  });
});

describe('settleAll', () => {
  it('reports successes and failures side by side, in order', async () => {
    const out = await solution.settleAll([1, 2, 3], async (n) => {
      if (n === 2) throw new Error('id 2 is cursed');
      return n * 2;
    });
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ status: 'fulfilled', value: 2 });
    expect(out[1].status).toBe('rejected');
    expect(out[1].reason.message).toBe('id 2 is cursed');
    expect(out[2]).toEqual({ status: 'fulfilled', value: 6 });
  });
  it('never rejects, even if everything fails', async () => {
    const out = await solution.settleAll([1, 2], async () => { throw new Error('all down'); });
    expect(out.every((r) => r.status === 'rejected')).toBe(true);
  });
  it('handles a loader that throws synchronously', async () => {
    const out = await solution.settleAll([1], () => { throw new Error('sync throw'); });
    expect(out[0].status).toBe('rejected');
  });
  it('does not delegate to Promise.allSettled', async () => {
    const original = Promise.allSettled;
    Promise.allSettled = () => { throw new Error('write it yourself'); };
    try {
      const out = await solution.settleAll([1], async (n) => n);
      expect(out[0]).toEqual({ status: 'fulfilled', value: 1 });
    } finally {
      Promise.allSettled = original;
    }
  });
});`,
        },
        {
          id: 'js-event-loop',
          title: 'Event loop order',
          kind: 'quiz',
          xp: 55,
          why: 'Interviewers ask it, and race conditions in real code are explained by it.',
          tags: ['event loop', 'microtasks', 'async'],
          brief: `The runtime finishes all synchronous code, then drains the **microtask**
queue (promise callbacks, \`queueMicrotask\`), then takes **one macrotask**
(\`setTimeout\`, I/O), then drains microtasks again. In Node,
\`process.nextTick\` jumps ahead of promise microtasks.

Answer from the model, not from memory of a blog post.`,
          quiz: [
            {
              q: 'What order do these log?\n\n```js\nconsole.log("A");\nsetTimeout(() => console.log("B"), 0);\nPromise.resolve().then(() => console.log("C"));\nconsole.log("D");\n```',
              options: ['A D C B', 'A D B C', 'A B C D', 'A C D B'],
              answer: [0],
              explain: 'Synchronous first (A, D). Then the microtask queue drains (C). The timer callback is a macrotask, so B runs last.',
            },
            {
              q: 'Inside an `async` function, what does `await somePromise` actually do?',
              options: [
                'Blocks the thread until the promise settles',
                'Returns immediately and schedules the rest of the function as a microtask when the promise settles',
                'Moves the rest of the function into a setTimeout callback',
                'Spawns a worker thread for the remainder of the function',
              ],
              answer: [1],
              explain: '`await` suspends the function and returns control to the caller. The continuation is queued as a microtask once the awaited value settles — nothing is blocked and no thread is created.',
            },
            {
              q: 'Which of these run before a pending `setTimeout(fn, 0)` callback? (select all)',
              options: [
                '`process.nextTick(fn)`',
                '`Promise.resolve().then(fn)`',
                '`queueMicrotask(fn)`',
                '`setImmediate(fn)`',
              ],
              answer: [0, 1, 2],
              explain: 'nextTick and the two microtask forms all drain before the event loop reaches the timers phase. `setImmediate` runs in the check phase — after timers that are already due, so it does not reliably beat a 0 ms timer.',
            },
            {
              q: 'A handler does `for (let i = 0; i < 5e9; i++) {}`. What happens to the pending promise callbacks and timers?',
              options: [
                'They interleave with the loop on a separate thread',
                'They are dropped',
                'They wait — nothing else runs until the synchronous loop finishes',
                'They run at the next microtask checkpoint inside the loop',
              ],
              answer: [2],
              explain: 'JavaScript is single-threaded per event loop. A long synchronous block starves everything: no promise callbacks, no timers, no incoming requests. This is why CPU-heavy work belongs in a worker.',
            },
            {
              q: 'Why does this log `1` and not `2`?\n\n```js\nlet value = 1;\nPromise.resolve().then(() => { value = 2; });\nconsole.log(value);\n```',
              options: [
                '`.then` callbacks never mutate outer variables',
                'The callback is a microtask; it runs after the current synchronous script, which includes the log',
                '`Promise.resolve()` is lazy and never runs',
                'The assignment is hoisted below the log',
              ],
              answer: [1],
              explain: 'Even an already-resolved promise defers its callback to the microtask queue. All synchronous code — including the log — runs first. This is the source of many "my state is stale" bugs.',
            },
          ],
        },
        {
          id: 'js-map-limit',
          title: 'Concurrency limits',
          kind: 'js',
          xp: 90,
          why: 'Promise.all on 5,000 rows will take down your database. This is the fix.',
          tags: ['async', 'concurrency', 'backpressure'],
          brief: `\`Promise.all\` has no brakes. Map 5,000 ids over an API call and you open
5,000 sockets at once. What you actually want is a worker pool.

## Task

Export \`mapLimit(items, limit, fn)\`:

- resolves to results **in input order**
- never has more than \`limit\` calls to \`fn\` in flight
- starts a new task the moment a slot frees up (do **not** process in fixed
  batches — one slow item must not idle the pool)
- \`fn\` is called as \`fn(item, index)\`
- if \`fn\` rejects, the returned promise rejects with the first error

Aim for the version with \`limit\` long-lived workers pulling from a shared
cursor.`,
          starter: `export async function mapLimit(items, limit, fn) {
  // TODO
}
`,
          hints: [
            'Batching (`chunk` the array, `Promise.all` each chunk) passes the order test but fails the "keeps the pool busy" test — a batch waits for its slowest member.',
            'Instead: `let cursor = 0`, then spawn `Math.min(limit, items.length)` worker loops. Each worker does `while (cursor < items.length) { const i = cursor++; results[i] = await fn(items[i], i); }`.',
            '`cursor++` is safe here: JavaScript is single-threaded, so the read-increment is atomic with respect to other workers.',
            'Await all the workers with `Promise.all(workers)`, then return the results array.',
          ],
          solution: `export async function mapLimit(items, limit, fn) {
  const list = [...items];
  const results = new Array(list.length);
  if (list.length === 0) return results;

  const size = Math.max(1, Math.min(limit, list.length));
  let cursor = 0;

  // Each worker pulls the next index as soon as it is free, so a single slow
  // item never idles the rest of the pool the way fixed batching would.
  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor++;
      results[index] = await fn(list[index], index);
    }
  };

  await Promise.all(Array.from({ length: size }, worker));
  return results;
}
`,
          tests: `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('mapLimit', () => {
  it('returns results in input order', async () => {
    const out = await solution.mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      await sleep(n === 1 ? 30 : 2);
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it('passes the index as the second argument', async () => {
    const out = await solution.mapLimit(['a', 'b', 'c'], 2, async (v, i) => v + i);
    expect(out).toEqual(['a0', 'b1', 'c2']);
  });

  it('handles an empty list', async () => {
    expect(await solution.mapLimit([], 3, async () => 1)).toEqual([]);
  });

  it('never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    await solution.mapLimit(Array.from({ length: 20 }, (_, i) => i), 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight--;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBe(3);
  });

  it('keeps the pool busy instead of batching', async () => {
    // One very slow item. With batching, total time approaches 2 * slow.
    // With a proper pool, the fast items flow through beside it.
    const durations = [120, 5, 5, 5, 5, 5, 5, 5];
    const started = Date.now();
    await solution.mapLimit(durations, 2, async (ms) => { await sleep(ms); return ms; });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(200);
  });

  it('runs with a limit larger than the list', async () => {
    const out = await solution.mapLimit([1, 2], 99, async (n) => n);
    expect(out).toEqual([1, 2]);
  });

  it('rejects when a task rejects', async () => {
    await expect(
      solution.mapLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('item 2 failed');
        return n;
      }),
    ).rejects.toThrow('item 2 failed');
  });
});`,
        },
        {
          id: 'js-retry-backoff',
          title: 'Retry with backoff',
          kind: 'js',
          xp: 85,
          why: 'Networks fail transiently. Retrying everything, forever, without jitter is how you DDoS yourself.',
          tags: ['async', 'resilience', 'retry'],
          brief: `A retry policy has four decisions: how many times, how long between,
which errors are worth retrying, and how to give up early.

## Task

Export \`retry(fn, options)\`. Options:

| option | default | meaning |
| --- | --- | --- |
| \`attempts\` | \`3\` | total tries, including the first |
| \`baseDelay\` | \`10\` | ms before the first retry |
| \`factor\` | \`2\` | exponential multiplier |
| \`shouldRetry\` | \`() => true\` | \`(error, attempt) => boolean\` |
| \`sleep\` | built-in \`setTimeout\` | injected so tests can observe delays |
| \`signal\` | — | an \`AbortSignal\` that stops retrying |

Behaviour:

- \`fn\` is called as \`fn(attempt)\` with \`attempt\` starting at 1
- delay before retry *n* is \`baseDelay * factor ** (n - 1)\`
- when attempts run out, reject with the **last** error
- if \`shouldRetry\` returns false, reject immediately without waiting
- if the signal is already aborted, do not call \`fn\` at all; if it aborts
  during a wait, reject with the abort reason`,
          starter: `const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function retry(fn, options = {}) {
  const {
    attempts = 3,
    baseDelay = 10,
    factor = 2,
    shouldRetry = () => true,
    sleep = defaultSleep,
    signal,
  } = options;

  // TODO
}
`,
          hints: [
            'A `for (let attempt = 1; attempt <= attempts; attempt++)` loop with try/catch is the clearest shape.',
            'On catch: if it was the last attempt, or `!shouldRetry(err, attempt)`, rethrow. Otherwise `await sleep(baseDelay * factor ** (attempt - 1))`.',
            'Check `signal?.aborted` before the first call and again after each sleep; throw `signal.reason` (or a new Error) when aborted.',
          ],
          solution: `const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function retry(fn, options = {}) {
  const {
    attempts = 3,
    baseDelay = 10,
    factor = 2,
    shouldRetry = () => true,
    sleep = defaultSleep,
    signal,
  } = options;

  const abortError = () => signal?.reason ?? new Error('aborted');
  if (signal?.aborted) throw abortError();

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const isLast = attempt === attempts;
      if (isLast || !shouldRetry(err, attempt)) throw err;
      await sleep(baseDelay * Math.pow(factor, attempt - 1));
      if (signal?.aborted) throw abortError();
    }
  }
  throw lastError;
}
`,
          tests: `describe('retry', () => {
  const noSleep = () => Promise.resolve();

  it('returns the first success without retrying', async () => {
    let calls = 0;
    const out = await solution.retry(async () => { calls++; return 'ok'; }, { sleep: noSleep });
    expect(out).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries until it succeeds', async () => {
    let calls = 0;
    const out = await solution.retry(async () => {
      calls++;
      if (calls < 3) throw new Error('flaky');
      return 'third time lucky';
    }, { attempts: 5, sleep: noSleep });
    expect(out).toBe('third time lucky');
    expect(calls).toBe(3);
  });

  it('passes the attempt number, starting at 1', async () => {
    const seen = [];
    await solution.retry(async (attempt) => {
      seen.push(attempt);
      if (attempt < 3) throw new Error('again');
      return attempt;
    }, { attempts: 3, sleep: noSleep });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('gives up after the attempt budget, reporting the last error', async () => {
    let calls = 0;
    await expect(
      solution.retry(async () => { calls++; throw new Error('failure ' + calls); },
        { attempts: 4, sleep: noSleep }),
    ).rejects.toThrow('failure 4');
    expect(calls).toBe(4);
  });

  it('backs off exponentially', async () => {
    const delays = [];
    await expect(
      solution.retry(async () => { throw new Error('x'); }, {
        attempts: 4,
        baseDelay: 100,
        factor: 3,
        sleep: (ms) => { delays.push(ms); return Promise.resolve(); },
      }),
    ).rejects.toThrow('x');
    expect(delays).toEqual([100, 300, 900]);
  });

  it('does not sleep after the final failure', async () => {
    const delays = [];
    await expect(
      solution.retry(async () => { throw new Error('x'); },
        { attempts: 2, baseDelay: 5, sleep: (ms) => { delays.push(ms); return Promise.resolve(); } }),
    ).rejects.toThrow();
    expect(delays).toHaveLength(1);
  });

  it('stops immediately when shouldRetry says no', async () => {
    let calls = 0;
    const delays = [];
    await expect(
      solution.retry(async () => {
        calls++;
        const err = new Error('bad request');
        err.status = 400;
        throw err;
      }, {
        attempts: 5,
        shouldRetry: (err) => err.status >= 500,
        sleep: (ms) => { delays.push(ms); return Promise.resolve(); },
      }),
    ).rejects.toThrow('bad request');
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it('does not call fn when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('too late'));
    let calls = 0;
    await expect(
      solution.retry(async () => { calls++; return 'nope'; }, { signal: controller.signal, sleep: noSleep }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it('stops retrying once the signal aborts mid-wait', async () => {
    const controller = new AbortController();
    let calls = 0;
    await expect(
      solution.retry(async () => { calls++; throw new Error('flaky'); }, {
        attempts: 10,
        signal: controller.signal,
        sleep: async () => { controller.abort(new Error('user navigated away')); },
      }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});`,
        },
        {
          id: 'js-task-queue',
          title: 'BOSS: cancellable task queue',
          kind: 'js',
          xp: 200,
          boss: true,
          why: 'Upload queues, job runners, and request schedulers are all this class. It is a real interview take-home.',
          tags: ['async', 'concurrency', 'cancellation', 'pub-sub'],
          brief: `Everything from this chapter in one object: bounded concurrency, per-task
promises, error isolation, and cancellation.

## Task

Export a class \`TaskQueue\`:

\`\`\`js
const queue = new TaskQueue({ concurrency: 2 });
const p = queue.push(async (signal) => { /* work */ return 'result'; });
\`\`\`

- \`constructor({ concurrency = 1 })\`
- \`push(task)\` — enqueue; returns a promise for that task's result. Tasks are
  started in FIFO order, at most \`concurrency\` at a time. The task receives an
  \`AbortSignal\`.
- One task rejecting must **not** stop the queue or reject other tasks. Only
  that task's own promise rejects.
- \`get size\` — queued but not started. \`get running\` — currently in flight.
- \`onIdle()\` — a promise that resolves when everything queued has finished.
  Resolves immediately if nothing is pending.
- \`abort(reason)\` — abort the signal given to running tasks, and reject every
  *queued* (not yet started) task with \`reason\`. Later \`push\` calls reject
  immediately.

Reject unhandled-rejection warnings from your design: every promise you create
must have a consumer.`,
          starter: `export class TaskQueue {
  constructor({ concurrency = 1 } = {}) {
    this.concurrency = concurrency;
    // TODO: pending list, running count, abort controller, idle waiters
  }

  get size() {}

  get running() {}

  push(task) {}

  onIdle() {}

  abort(reason) {}
}
`,
          hints: [
            'Store queued entries as `{ task, resolve, reject }`. `push` returns `new Promise((resolve, reject) => { this.#pending.push({ task, resolve, reject }); this.#drain(); })`.',
            '`#drain()` loops while `running < concurrency && pending.length`: shift an entry, increment running, and run it. Do **not** await inside drain — start it and let its `.then` call `#drain()` again.',
            'Wrap the task call so failures only touch that entry: `Promise.resolve().then(() => entry.task(signal)).then(entry.resolve, entry.reject).finally(() => { running--; this.#drain(); this.#checkIdle(); })`.',
            'Keep an array of idle resolvers. In `#checkIdle`, if `running === 0 && pending.length === 0`, resolve and clear them.',
            'For `abort`, call `controller.abort(reason)`, then splice the pending list and reject each entry with the reason. Set an `aborted` flag so later pushes reject.',
          ],
          solution: `export class TaskQueue {
  #pending = [];
  #running = 0;
  #idleWaiters = [];
  #controller = new AbortController();
  #abortReason = null;

  constructor({ concurrency = 1 } = {}) {
    this.concurrency = Math.max(1, concurrency);
  }

  get size() {
    return this.#pending.length;
  }

  get running() {
    return this.#running;
  }

  push(task) {
    if (this.#abortReason) return Promise.reject(this.#abortReason);
    return new Promise((resolve, reject) => {
      this.#pending.push({ task, resolve, reject });
      this.#drain();
    });
  }

  onIdle() {
    if (this.#running === 0 && this.#pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  abort(reason = new Error('queue aborted')) {
    this.#abortReason = reason;
    this.#controller.abort(reason);
    const dropped = this.#pending.splice(0, this.#pending.length);
    for (const entry of dropped) entry.reject(reason);
    this.#checkIdle();
  }

  #drain() {
    while (this.#running < this.concurrency && this.#pending.length > 0) {
      const entry = this.#pending.shift();
      this.#running++;
      // Start, do not await: the loop must be free to fill the other slots.
      Promise.resolve()
        .then(() => entry.task(this.#controller.signal))
        .then(entry.resolve, entry.reject)
        .finally(() => {
          this.#running--;
          this.#drain();
          this.#checkIdle();
        });
    }
  }

  #checkIdle() {
    if (this.#running === 0 && this.#pending.length === 0) {
      const waiters = this.#idleWaiters.splice(0, this.#idleWaiters.length);
      for (const resolve of waiters) resolve();
    }
  }
}
`,
          tests: `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('TaskQueue basics', () => {
  it('resolves each task with its own result', async () => {
    const q = new solution.TaskQueue({ concurrency: 2 });
    const results = await Promise.all([
      q.push(async () => 'a'),
      q.push(async () => 'b'),
      q.push(async () => 'c'),
    ]);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  it('starts tasks in FIFO order', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    const order = [];
    const ps = ['a', 'b', 'c'].map((name) => q.push(async () => { order.push(name); }));
    await Promise.all(ps);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('respects the concurrency limit', async () => {
    const q = new solution.TaskQueue({ concurrency: 3 });
    let inFlight = 0;
    let peak = 0;
    await Promise.all(Array.from({ length: 12 }, () => q.push(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight--;
    })));
    expect(peak).toBe(3);
  });

  it('reports size and running', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    const ps = [q.push(() => sleep(30)), q.push(() => sleep(1)), q.push(() => sleep(1))];
    await sleep(5);
    expect(q.running).toBe(1);
    expect(q.size).toBe(2);
    await Promise.all(ps);
    expect(q.running).toBe(0);
    expect(q.size).toBe(0);
  });

  it('keeps the pool busy rather than batching', async () => {
    const q = new solution.TaskQueue({ concurrency: 2 });
    const started = Date.now();
    await Promise.all([120, 5, 5, 5, 5, 5, 5].map((ms) => q.push(() => sleep(ms))));
    expect(Date.now() - started).toBeLessThan(200);
  });
});

describe('error isolation', () => {
  it('a failing task rejects only its own promise', async () => {
    const q = new solution.TaskQueue({ concurrency: 2 });
    const bad = q.push(async () => { throw new Error('task blew up'); });
    const good = q.push(async () => 'fine');
    await expect(bad).rejects.toThrow('task blew up');
    expect(await good).toBe('fine');
  });

  it('the queue keeps draining after a failure', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    const results = [];
    const ps = [
      q.push(async () => { throw new Error('nope'); }).catch(() => results.push('failed')),
      q.push(async () => { results.push('ran anyway'); }),
    ];
    await Promise.all(ps);
    expect(results).toEqual(['failed', 'ran anyway']);
  });

  it('handles a task that throws synchronously', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    await expect(q.push(() => { throw new Error('sync boom'); })).rejects.toThrow('sync boom');
    expect(await q.push(async () => 'still alive')).toBe('still alive');
  });
});

describe('onIdle', () => {
  it('resolves once everything finishes', async () => {
    const q = new solution.TaskQueue({ concurrency: 2 });
    let done = 0;
    for (let i = 0; i < 6; i++) q.push(async () => { await sleep(5); done++; }).catch(() => {});
    await q.onIdle();
    expect(done).toBe(6);
    expect(q.running).toBe(0);
  });

  it('resolves immediately when nothing is pending', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    let resolved = false;
    q.onIdle().then(() => { resolved = true; });
    await sleep(5);
    expect(resolved).toBe(true);
  });
});

describe('abort', () => {
  it('rejects queued tasks and never starts them', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    let startedSecond = false;
    const first = q.push(() => sleep(20));
    const second = q.push(async () => { startedSecond = true; });
    q.abort(new Error('user cancelled'));
    await expect(second).rejects.toThrow('user cancelled');
    await first.catch(() => {});
    expect(startedSecond).toBe(false);
  });

  it('signals running tasks', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    let sawAbort = false;
    const p = q.push(async (signal) => {
      await sleep(20);
      sawAbort = signal.aborted;
      return 'finished late';
    });
    await sleep(5);
    q.abort(new Error('stop'));
    await p.catch(() => {});
    expect(sawAbort).toBe(true);
  });

  it('rejects tasks pushed after an abort', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    q.abort(new Error('closed'));
    await expect(q.push(async () => 'nope')).rejects.toThrow('closed');
  });
});`,
        },
      ],
    },

    /* ================================================================== */
    {
      id: 'js-data',
      title: 'Data Shaping & Immutability',
      summary: 'Turning API payloads into something your UI can render without re-fetching.',
      lessons: [
        {
          id: 'js-group-index',
          title: 'groupBy, keyBy, countBy',
          kind: 'js',
          xp: 55,
          why: 'Reaching for lodash is fine; not knowing what it does is not. These three replace most nested loops.',
          tags: ['collections', 'data shaping'],
          brief: `Most "the frontend is slow" bugs are a nested loop doing
\`list.find(...)\` inside a \`map\`. Indexing the data once turns O(n·m) into
O(n + m).

## Task

Export:

- \`groupBy(items, key)\` — \`key\` is a function or a property name. Returns a
  plain object of arrays, preserving input order within each group.
- \`keyBy(items, key)\` — one item per key; **last one wins**.
- \`countBy(items, key)\` — counts per key.

All three must handle an empty list, and must not crash on a key function that
returns \`undefined\` (bucket it under the string \`"undefined"\`).`,
          starter: `export function groupBy(items, key) {
  // TODO: accept either a function or a property name
}

export function keyBy(items, key) {
  // TODO
}

export function countBy(items, key) {
  // TODO
}
`,
          hints: [
            'Normalise the key argument once: `const get = typeof key === "function" ? key : (item) => item[key];`',
            'Use `Object.create(null)` or `{}` and `(acc[k] ??= []).push(item)`.',
            'Object keys are strings, so `String(get(item))` gives you the "undefined" bucket for free.',
          ],
          solution: `const toGetter = (key) => (typeof key === 'function' ? key : (item) => item[key]);

export function groupBy(items, key) {
  const get = toGetter(key);
  const out = {};
  for (const item of items) {
    const k = String(get(item));
    (out[k] ??= []).push(item);
  }
  return out;
}

export function keyBy(items, key) {
  const get = toGetter(key);
  const out = {};
  for (const item of items) out[String(get(item))] = item;
  return out;
}

export function countBy(items, key) {
  const get = toGetter(key);
  const out = {};
  for (const item of items) {
    const k = String(get(item));
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
`,
          tests: `const users = [
  { id: 1, name: 'ada', team: 'core' },
  { id: 2, name: 'bob', team: 'growth' },
  { id: 3, name: 'cy', team: 'core' },
];

describe('groupBy', () => {
  it('groups by property name', () => {
    expect(solution.groupBy(users, 'team')).toEqual({
      core: [users[0], users[2]],
      growth: [users[1]],
    });
  });
  it('groups by function', () => {
    expect(solution.groupBy([1, 2, 3, 4], (n) => (n % 2 ? 'odd' : 'even'))).toEqual({
      odd: [1, 3],
      even: [2, 4],
    });
  });
  it('preserves input order inside a group', () => {
    expect(solution.groupBy(users, 'team').core.map((u) => u.id)).toEqual([1, 3]);
  });
  it('handles an empty list', () => {
    expect(solution.groupBy([], 'team')).toEqual({});
  });
  it('buckets a missing key under "undefined"', () => {
    const out = solution.groupBy([{ id: 1 }], 'team');
    expect(out.undefined).toHaveLength(1);
  });
});

describe('keyBy', () => {
  it('indexes by id', () => {
    const byId = solution.keyBy(users, 'id');
    expect(byId['2'].name).toBe('bob');
    expect(Object.keys(byId)).toHaveLength(3);
  });
  it('last one wins on a duplicate key', () => {
    const out = solution.keyBy([{ k: 'a', v: 1 }, { k: 'a', v: 2 }], 'k');
    expect(out.a.v).toBe(2);
  });
});

describe('countBy', () => {
  it('counts per key', () => {
    expect(solution.countBy(users, 'team')).toEqual({ core: 2, growth: 1 });
  });
  it('counts with a function', () => {
    expect(solution.countBy([1, 2, 3, 4, 5], (n) => (n > 3 ? 'big' : 'small')))
      .toEqual({ small: 3, big: 2 });
  });
  it('handles an empty list', () => {
    expect(solution.countBy([], 'x')).toEqual({});
  });
});`,
        },
        {
          id: 'js-immutable-update',
          title: 'Immutable nested updates',
          kind: 'js',
          xp: 80,
          why: 'React bails out of re-rendering by reference equality. Mutating state is why your component "does not update".',
          tags: ['immutability', 'structural sharing', 'react-adjacent'],
          brief: `React (and \`memo\`, and \`useMemo\`) compares by reference. Mutate state in
place and nothing re-renders; clone the whole tree and everything re-renders.
The right answer is **structural sharing**: copy the path you changed, keep
every other reference identical.

## Task

Export \`setIn(obj, path, value)\` and \`updateIn(obj, path, updater)\` where
\`path\` is an array of keys (strings for objects, numbers for arrays).

Requirements:

- the input is never mutated
- every object **on the path** is a fresh copy
- every branch **off the path** keeps its original reference (this is what the
  tests check hardest)
- arrays stay arrays
- missing intermediate objects are created (a numeric key creates an array)
- \`updateIn\` calls \`updater(currentValue)\`, where a missing value is
  \`undefined\``,
          starter: `export function setIn(obj, path, value) {
  // TODO
}

export function updateIn(obj, path, updater) {
  // TODO: reuse setIn
}
`,
          hints: [
            'Recursion is much easier than a loop here. Base case: an empty path returns `value`.',
            'Shallow-copy the current level based on its type: `Array.isArray(node) ? [...node] : { ...node }`. Then assign only `copy[head] = recurse(node?.[head], rest)`.',
            'Spreading an array with `[...node]` keeps every element reference identical — that is the structural sharing the tests look for.',
            'For a missing intermediate, decide by the *next* key: `typeof nextKey === "number" ? [] : {}`.',
          ],
          solution: `export function setIn(obj, path, value) {
  if (path.length === 0) return value;

  const [head, ...rest] = path;
  const isIndex = typeof head === 'number';
  const base = obj ?? (isIndex ? [] : {});
  // Copy only this level; untouched siblings keep their identity.
  const copy = Array.isArray(base) ? [...base] : { ...base };
  copy[head] = setIn(base[head], rest, value);
  return copy;
}

export function updateIn(obj, path, updater) {
  const current = path.reduce((node, key) => (node == null ? undefined : node[key]), obj);
  return setIn(obj, path, updater(current));
}
`,
          tests: `const state = {
  user: { name: 'ada', prefs: { theme: 'dark', density: 'cosy' } },
  posts: [
    { id: 1, title: 'first', tags: ['a'] },
    { id: 2, title: 'second', tags: ['b'] },
  ],
  meta: { fetchedAt: 123 },
};

describe('setIn', () => {
  it('sets a nested value', () => {
    const next = solution.setIn(state, ['user', 'prefs', 'theme'], 'light');
    expect(next.user.prefs.theme).toBe('light');
  });

  it('does not mutate the input', () => {
    const before = JSON.stringify(state);
    solution.setIn(state, ['user', 'prefs', 'theme'], 'light');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('replaces every object on the path with a new reference', () => {
    const next = solution.setIn(state, ['user', 'prefs', 'theme'], 'light');
    expect(next).not.toBe(state);
    expect(next.user).not.toBe(state.user);
    expect(next.user.prefs).not.toBe(state.user.prefs);
  });

  it('keeps branches off the path referentially identical', () => {
    const next = solution.setIn(state, ['user', 'prefs', 'theme'], 'light');
    expect(next.posts).toBe(state.posts);
    expect(next.meta).toBe(state.meta);
  });

  it('works through arrays and keeps siblings identical', () => {
    const next = solution.setIn(state, ['posts', 1, 'title'], 'renamed');
    expect(Array.isArray(next.posts)).toBe(true);
    expect(next.posts[1].title).toBe('renamed');
    expect(next.posts[0]).toBe(state.posts[0]);
    expect(next.posts).not.toBe(state.posts);
    expect(next.posts[1].tags).toBe(state.posts[1].tags);
  });

  it('creates missing objects along the way', () => {
    const next = solution.setIn({}, ['a', 'b', 'c'], 1);
    expect(next).toEqual({ a: { b: { c: 1 } } });
  });

  it('creates an array when the key is numeric', () => {
    const next = solution.setIn({}, ['list', 0, 'ok'], true);
    expect(Array.isArray(next.list)).toBe(true);
    expect(next.list[0]).toEqual({ ok: true });
  });

  it('an empty path replaces the whole value', () => {
    expect(solution.setIn(state, [], 'replaced')).toBe('replaced');
  });
});

describe('updateIn', () => {
  it('passes the current value to the updater', () => {
    const next = solution.updateIn(state, ['meta', 'fetchedAt'], (n) => n + 1);
    expect(next.meta.fetchedAt).toBe(124);
    expect(state.meta.fetchedAt).toBe(123);
  });

  it('appends to a nested array without mutating it', () => {
    const next = solution.updateIn(state, ['posts', 0, 'tags'], (tags) => [...tags, 'new']);
    expect(next.posts[0].tags).toEqual(['a', 'new']);
    expect(state.posts[0].tags).toEqual(['a']);
    expect(next.posts[1]).toBe(state.posts[1]);
  });

  it('gives the updater undefined for a missing path', () => {
    const next = solution.updateIn({}, ['count'], (n) => (n ?? 0) + 1);
    expect(next.count).toBe(1);
  });
});`,
        },
        {
          id: 'js-generators',
          title: 'Generators for lazy pagination',
          kind: 'js',
          xp: 75,
          why: 'Turns "fetch every page into memory" into a stream you can stop consuming.',
          tags: ['generators', 'iterators', 'async'],
          brief: `An async generator lets a caller \`for await\` over an unbounded source and
stop whenever it likes — the producer only does work that is actually consumed.
This is how paginated API clients should be written.

## Task

Export:

- \`async function* paginate(fetchPage)\` — \`fetchPage(cursor)\` resolves to
  \`{ items, nextCursor }\`. Yield **each item** one at a time, starting from
  cursor \`undefined\`, and stop when \`nextCursor\` is null/undefined. A page is
  only fetched when its first item is actually pulled.
- \`async function take(n, iterable)\` — collect at most \`n\` items into an array,
  then stop consuming.
- \`function* chunk(iterable, size)\` — a **sync** generator yielding arrays of
  up to \`size\`.`,
          starter: `export async function* paginate(fetchPage) {
  // TODO
}

export async function take(n, iterable) {
  // TODO: stop pulling once you have n
}

export function* chunk(iterable, size) {
  // TODO
}
`,
          hints: [
            'In `paginate`, loop: `let cursor; while (true) { const page = await fetchPage(cursor); yield* page.items; if (page.nextCursor == null) return; cursor = page.nextCursor; }`.',
            '`yield*` delegates to another iterable — it yields each element in turn.',
            'In `take`, `for await (const item of iterable) { out.push(item); if (out.length >= n) break; }`. The `break` is what stops the generator: it triggers the iterator\'s `return()`.',
            'Guard `take(0, ...)`: return `[]` before touching the iterable at all.',
          ],
          solution: `export async function* paginate(fetchPage) {
  let cursor;
  while (true) {
    const page = await fetchPage(cursor);
    yield* page.items;
    if (page.nextCursor == null) return;
    cursor = page.nextCursor;
  }
}

export async function take(n, iterable) {
  const out = [];
  if (n <= 0) return out;
  for await (const item of iterable) {
    out.push(item);
    // Breaking closes the generator, so no further pages are fetched.
    if (out.length >= n) break;
  }
  return out;
}

export function* chunk(iterable, size) {
  let batch = [];
  for (const item of iterable) {
    batch.push(item);
    if (batch.length === size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length) yield batch;
}
`,
          tests: `const makeSource = () => {
  const pages = {
    undefined: { items: [1, 2], nextCursor: 'p2' },
    p2: { items: [3, 4], nextCursor: 'p3' },
    p3: { items: [5], nextCursor: null },
  };
  const calls = [];
  return {
    calls,
    fetchPage: async (cursor) => {
      calls.push(cursor);
      return pages[String(cursor)];
    },
  };
};

describe('paginate', () => {
  it('yields every item across every page', async () => {
    const src = makeSource();
    const out = [];
    for await (const item of solution.paginate(src.fetchPage)) out.push(item);
    expect(out).toEqual([1, 2, 3, 4, 5]);
  });

  it('starts with an undefined cursor and follows nextCursor', async () => {
    const src = makeSource();
    for await (const _ of solution.paginate(src.fetchPage)) { /* drain */ }
    expect(src.calls).toEqual([undefined, 'p2', 'p3']);
  });

  it('is lazy: nothing is fetched until the first pull', async () => {
    const src = makeSource();
    const gen = solution.paginate(src.fetchPage);
    expect(src.calls).toEqual([]);
    await gen.next();
    expect(src.calls).toEqual([undefined]);
  });

  it('handles an empty first page', async () => {
    const out = [];
    for await (const item of solution.paginate(async () => ({ items: [], nextCursor: null }))) {
      out.push(item);
    }
    expect(out).toEqual([]);
  });
});

describe('take', () => {
  it('collects at most n items', async () => {
    const src = makeSource();
    expect(await solution.take(3, solution.paginate(src.fetchPage))).toEqual([1, 2, 3]);
  });

  it('stops fetching pages it does not need', async () => {
    const src = makeSource();
    await solution.take(2, solution.paginate(src.fetchPage));
    expect(src.calls).toEqual([undefined]);
  });

  it('returns everything if n exceeds the source', async () => {
    const src = makeSource();
    expect(await solution.take(99, solution.paginate(src.fetchPage))).toEqual([1, 2, 3, 4, 5]);
  });

  it('take(0) consumes nothing', async () => {
    const src = makeSource();
    expect(await solution.take(0, solution.paginate(src.fetchPage))).toEqual([]);
    expect(src.calls).toEqual([]);
  });
});

describe('chunk', () => {
  it('batches into fixed sizes', () => {
    expect([...solution.chunk([1, 2, 3, 4, 5, 6], 2)]).toEqual([[1, 2], [3, 4], [5, 6]]);
  });
  it('keeps a short final batch', () => {
    expect([...solution.chunk([1, 2, 3, 4, 5], 2)]).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('handles an empty input', () => {
    expect([...solution.chunk([], 3)]).toEqual([]);
  });
  it('works with any iterable', () => {
    expect([...solution.chunk(new Set([1, 2, 3]), 2)]).toEqual([[1, 2], [3]]);
  });
});`,
        },
      ],
    },

    /* ================================================================== */
    {
      id: 'js-errors',
      title: 'Errors You Can Act On',
      summary: 'Error classes, typed failures, and a fetch wrapper you would actually ship.',
      lessons: [
        {
          id: 'js-error-classes',
          title: 'Custom error classes',
          kind: 'js',
          xp: 65,
          why: '`throw new Error("failed")` gives your caller nothing to branch on. Error types are an API.',
          tags: ['errors', 'classes'],
          brief: `A caller needs to distinguish "the user typed something wrong" (show a
form message) from "the database is down" (retry, page someone). That means
distinguishable error types carrying structured data.

## Task

Export:

- \`AppError\` — extends \`Error\`. Constructor \`(message, options = {})\` where
  options may hold \`code\`, \`status\`, and \`cause\`. Sets \`name\` to the concrete
  subclass's name, defaults \`code\` to \`'APP_ERROR'\` and \`status\` to \`500\`, and
  exposes \`toJSON()\` returning \`{ name, message, code, status }\`.
- \`ValidationError\` — extends \`AppError\`. \`(message, fields = {})\`, code
  \`'VALIDATION'\`, status \`400\`, and a \`fields\` object.
- \`NotFoundError\` — extends \`AppError\`. \`(resource, id)\`, message
  \`\`\`\`User 42 not found\`\`\`\`, code \`'NOT_FOUND'\`, status \`404\`, plus
  \`resource\` and \`id\` properties.
- \`isRetryable(error)\` — true for status ≥ 500 or a missing status, false for
  4xx.

Every instance must satisfy \`instanceof Error\`, and a captured
\`error.stack\` must exist.`,
          starter: `export class AppError extends Error {
  constructor(message, options = {}) {
    // TODO
  }
}

export class ValidationError extends AppError {}

export class NotFoundError extends AppError {}

export function isRetryable(error) {
  // TODO
}
`,
          hints: [
            'Call `super(message, { cause: options.cause })` — the second argument is standard in modern JS and sets `error.cause`.',
            '`this.name = new.target.name` sets the name to the *concrete* subclass automatically, so subclasses do not each need a line.',
            'A `NotFoundError` constructor takes `(resource, id)` and builds the message itself before calling super.',
            'For `isRetryable`, `const status = error?.status; return status == null || status >= 500;`',
          ],
          solution: `export class AppError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    // new.target is the concrete subclass being constructed.
    this.name = new.target.name;
    this.code = options.code ?? 'APP_ERROR';
    this.status = options.status ?? 500;
    if (Error.captureStackTrace) Error.captureStackTrace(this, new.target);
  }

  toJSON() {
    return { name: this.name, message: this.message, code: this.code, status: this.status };
  }
}

export class ValidationError extends AppError {
  constructor(message, fields = {}) {
    super(message, { code: 'VALIDATION', status: 400 });
    this.fields = fields;
  }

  toJSON() {
    return { ...super.toJSON(), fields: this.fields };
  }
}

export class NotFoundError extends AppError {
  constructor(resource, id) {
    super(resource + ' ' + id + ' not found', { code: 'NOT_FOUND', status: 404 });
    this.resource = resource;
    this.id = id;
  }
}

export function isRetryable(error) {
  const status = error?.status;
  return status == null || status >= 500;
}
`,
          tests: `describe('AppError', () => {
  it('is a real Error with a stack', () => {
    const e = new solution.AppError('something broke');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(solution.AppError);
    expect(e.message).toBe('something broke');
    expect(typeof e.stack).toBe('string');
  });
  it('defaults code and status', () => {
    const e = new solution.AppError('x');
    expect(e.code).toBe('APP_ERROR');
    expect(e.status).toBe(500);
    expect(e.name).toBe('AppError');
  });
  it('accepts code, status and cause', () => {
    const root = new Error('socket closed');
    const e = new solution.AppError('upstream failed', { code: 'UPSTREAM', status: 502, cause: root });
    expect(e.code).toBe('UPSTREAM');
    expect(e.status).toBe(502);
    expect(e.cause).toBe(root);
  });
  it('serialises for a log line', () => {
    const e = new solution.AppError('nope', { code: 'X', status: 503 });
    expect(e.toJSON()).toEqual({ name: 'AppError', message: 'nope', code: 'X', status: 503 });
  });
  it('survives JSON.stringify', () => {
    const parsed = JSON.parse(JSON.stringify(new solution.AppError('nope', { code: 'X' })));
    expect(parsed.code).toBe('X');
  });
});

describe('ValidationError', () => {
  it('carries the offending fields', () => {
    const e = new solution.ValidationError('invalid signup', { email: 'must be an email' });
    expect(e).toBeInstanceOf(solution.AppError);
    expect(e).toBeInstanceOf(solution.ValidationError);
    expect(e.name).toBe('ValidationError');
    expect(e.code).toBe('VALIDATION');
    expect(e.status).toBe(400);
    expect(e.fields).toEqual({ email: 'must be an email' });
  });
  it('defaults fields to an empty object', () => {
    expect(new solution.ValidationError('bad').fields).toEqual({});
  });
});

describe('NotFoundError', () => {
  it('builds its own message', () => {
    const e = new solution.NotFoundError('User', 42);
    expect(e.message).toBe('User 42 not found');
    expect(e.status).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.resource).toBe('User');
    expect(e.id).toBe(42);
    expect(e.name).toBe('NotFoundError');
  });
});

describe('the point of all this: branching', () => {
  it('lets a caller handle each failure differently', () => {
    const handle = (error) => {
      if (error instanceof solution.ValidationError) return 'show form errors';
      if (error instanceof solution.NotFoundError) return '404 page';
      if (error instanceof solution.AppError) return 'generic error page';
      return 'unknown';
    };
    expect(handle(new solution.ValidationError('x'))).toBe('show form errors');
    expect(handle(new solution.NotFoundError('Post', 1))).toBe('404 page');
    expect(handle(new solution.AppError('x'))).toBe('generic error page');
    expect(handle(new TypeError('x'))).toBe('unknown');
  });
});

describe('isRetryable', () => {
  it('retries server errors', () => {
    expect(solution.isRetryable(new solution.AppError('x', { status: 503 }))).toBe(true);
    expect(solution.isRetryable(new solution.AppError('x', { status: 500 }))).toBe(true);
  });
  it('does not retry client errors', () => {
    expect(solution.isRetryable(new solution.ValidationError('x'))).toBe(false);
    expect(solution.isRetryable(new solution.NotFoundError('User', 1))).toBe(false);
  });
  it('retries errors with no status at all (network-level)', () => {
    expect(solution.isRetryable(new Error('ECONNRESET'))).toBe(true);
  });
});`,
        },
        {
          id: 'js-resilient-client',
          title: 'BOSS: an API client you would ship',
          kind: 'js',
          xp: 200,
          boss: true,
          why: 'Every team writes this wrapper. Writing a correct one is a mid-level deliverable.',
          tags: ['async', 'errors', 'resilience', 'cancellation'],
          brief: `Raw \`fetch\` is not shippable: it does not throw on 500, has no timeout,
no retries, and no consistent error type. Wrap it once, properly.

## Task

Export \`createClient(options)\` where options are
\`{ baseUrl, fetch, timeoutMs = 1000, retries = 2, backoff = () => 0 }\`.
It returns \`{ get(path, opts), post(path, body, opts) }\`.

Behaviour:

1. URLs are \`baseUrl + path\`.
2. A 2xx JSON response resolves to the parsed body. A 204 (or empty body)
   resolves to \`null\`.
3. A non-2xx response throws \`HttpError\` (also exported) with \`status\`,
   \`body\` (parsed if JSON, else text) and message \`\`\`\`GET /users failed with 500\`\`\`\`.
4. Retry **only** 5xx responses and network errors — never 4xx. At most
   \`retries\` extra attempts, awaiting \`backoff(attempt)\` between them.
5. Each attempt is bounded by \`timeoutMs\` using \`AbortSignal\`; a timeout is a
   retryable failure. Pass the signal to \`fetch\`.
6. A caller-supplied \`opts.signal\` cancels everything immediately, with no
   retry.
7. \`post\` sends \`JSON.stringify(body)\` with \`content-type: application/json\`.`,
          starter: `export class HttpError extends Error {
  constructor(method, path, status, body) {
    super(method + ' ' + path + ' failed with ' + status);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export function createClient({ baseUrl = '', fetch: fetchImpl = fetch, timeoutMs = 1000, retries = 2, backoff = () => 0 } = {}) {
  // TODO: one request() helper, then get/post on top of it
  return {
    get(path, opts) {},
    post(path, body, opts) {},
  };
}
`,
          hints: [
            'Write one `request(method, path, { body, signal })` and have `get`/`post` delegate. Everything below lives in that one function.',
            'For a per-attempt timeout, `AbortSignal.timeout(timeoutMs)` plus `AbortSignal.any([callerSignal, timeoutSignal])` is the modern way. A manual `AbortController` with a `setTimeout` also works — just `clearTimeout` in a `finally`.',
            'Decide retryability before throwing: a 5xx or a thrown network/timeout error is retryable; a 4xx never is. If the caller\'s own signal aborted, do not retry.',
            'Read the body once. `const text = await res.text()`, then try `JSON.parse(text)` and fall back to the raw text — calling `res.json()` on an error response often throws on an HTML error page.',
            'Loop `for (let attempt = 0; attempt <= retries; attempt++)`, and only `await backoff(attempt)` when you are actually going to try again.',
          ],
          solution: `export class HttpError extends Error {
  constructor(method, path, status, body) {
    super(method + ' ' + path + ' failed with ' + status);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export function createClient({
  baseUrl = '',
  fetch: fetchImpl = fetch,
  timeoutMs = 1000,
  retries = 2,
  backoff = () => 0,
} = {}) {
  const parse = async (res) => {
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const request = async (method, path, { body, signal, headers } = {}) => {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) throw signal.reason ?? new Error('aborted');

      // A fresh timeout per attempt; the caller's signal cancels the whole thing.
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

      try {
        const res = await fetchImpl(baseUrl + path, {
          method,
          signal: combined,
          headers: {
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...headers,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });

        if (res.ok) return await parse(res);

        const error = new HttpError(method, path, res.status, await parse(res));
        // 4xx will fail identically next time; only server errors are worth a retry.
        if (res.status < 500 || attempt === retries) throw error;
        lastError = error;
      } catch (err) {
        if (err instanceof HttpError && err.status < 500) throw err;
        if (signal?.aborted) throw signal.reason ?? err;
        if (attempt === retries) throw err;
        lastError = err;
      }

      await backoff(attempt + 1);
    }

    throw lastError;
  };

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
  };
}
`,
          tests: `const jsonResponse = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (data === undefined ? '' : JSON.stringify(data)),
});
const textResponse = (status, text) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => text,
});

describe('happy path', () => {
  it('parses a JSON body', async () => {
    const client = solution.createClient({
      baseUrl: 'https://api.test',
      fetch: async () => jsonResponse(200, { id: 1, name: 'ada' }),
    });
    expect(await client.get('/users/1')).toEqual({ id: 1, name: 'ada' });
  });

  it('builds the URL from baseUrl + path', async () => {
    let seen;
    const client = solution.createClient({
      baseUrl: 'https://api.test',
      fetch: async (url) => { seen = url; return jsonResponse(200, {}); },
    });
    await client.get('/users');
    expect(seen).toBe('https://api.test/users');
  });

  it('resolves null for 204', async () => {
    const client = solution.createClient({ fetch: async () => jsonResponse(204) });
    expect(await client.get('/things')).toBe(null);
  });

  it('posts JSON with the right header and method', async () => {
    let init;
    const client = solution.createClient({
      fetch: async (_url, opts) => { init = opts; return jsonResponse(201, { id: 9 }); },
    });
    const out = await client.post('/users', { name: 'bob' });
    expect(out).toEqual({ id: 9 });
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"bob"}');
    const contentType = init.headers['content-type'] ?? init.headers['Content-Type'];
    expect(contentType).toBe('application/json');
  });

  it('passes an AbortSignal to fetch', async () => {
    let init;
    const client = solution.createClient({
      fetch: async (_url, opts) => { init = opts; return jsonResponse(200, {}); },
    });
    await client.get('/x');
    expect(init.signal).toBeDefined();
    expect(typeof init.signal.aborted).toBe('boolean');
  });
});

describe('errors', () => {
  it('throws HttpError on a 4xx with status and body', async () => {
    const client = solution.createClient({
      fetch: async () => jsonResponse(404, { error: 'no such user' }),
    });
    let caught;
    try { await client.get('/users/99'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(solution.HttpError);
    expect(caught.status).toBe(404);
    expect(caught.body).toEqual({ error: 'no such user' });
    expect(caught.message).toBe('GET /users/99 failed with 404');
  });

  it('keeps a non-JSON error body as text', async () => {
    const client = solution.createClient({
      fetch: async () => textResponse(500, '<html>gateway down</html>'),
      retries: 0,
    });
    let caught;
    try { await client.get('/x'); } catch (e) { caught = e; }
    expect(caught.body).toBe('<html>gateway down</html>');
  });
});

describe('retries', () => {
  it('retries 5xx and succeeds', async () => {
    let calls = 0;
    const client = solution.createClient({
      retries: 2,
      fetch: async () => {
        calls++;
        return calls < 3 ? jsonResponse(503, { error: 'unavailable' }) : jsonResponse(200, { ok: true });
      },
    });
    expect(await client.get('/x')).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it('never retries a 4xx', async () => {
    let calls = 0;
    const client = solution.createClient({
      retries: 5,
      fetch: async () => { calls++; return jsonResponse(400, { error: 'bad input' }); },
    });
    await expect(client.get('/x')).rejects.toThrow('failed with 400');
    expect(calls).toBe(1);
  });

  it('retries network errors', async () => {
    let calls = 0;
    const client = solution.createClient({
      retries: 2,
      fetch: async () => {
        calls++;
        if (calls < 3) throw new TypeError('fetch failed');
        return jsonResponse(200, { recovered: true });
      },
    });
    expect(await client.get('/x')).toEqual({ recovered: true });
    expect(calls).toBe(3);
  });

  it('stops after the retry budget, reporting the last failure', async () => {
    let calls = 0;
    const client = solution.createClient({
      retries: 2,
      fetch: async () => { calls++; return jsonResponse(500, { error: 'boom' }); },
    });
    await expect(client.get('/x')).rejects.toThrow('failed with 500');
    expect(calls).toBe(3);
  });

  it('awaits backoff between attempts, with the attempt number', async () => {
    const seen = [];
    let calls = 0;
    const client = solution.createClient({
      retries: 2,
      backoff: async (attempt) => { seen.push(attempt); },
      fetch: async () => { calls++; return jsonResponse(500, {}); },
    });
    await client.get('/x').catch(() => {});
    expect(calls).toBe(3);
    expect(seen).toEqual([1, 2]);
  });
});

describe('timeouts and cancellation', () => {
  it('times out a hanging request and retries it', async () => {
    let calls = 0;
    const client = solution.createClient({
      timeoutMs: 30,
      retries: 1,
      fetch: async (_url, opts) => {
        calls++;
        if (calls === 1) {
          // Hang until the per-attempt signal fires.
          return await new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () => reject(new Error('aborted by signal')));
          });
        }
        return jsonResponse(200, { late: false });
      },
    });
    expect(await client.get('/slow')).toEqual({ late: false });
    expect(calls).toBe(2);
  });

  it('a caller abort stops everything with no retry', async () => {
    const controller = new AbortController();
    let calls = 0;
    const client = solution.createClient({
      retries: 5,
      timeoutMs: 500,
      fetch: async (_url, opts) => {
        calls++;
        // Abort after the listener is attached, the way a real user navigation would.
        setTimeout(() => controller.abort(new Error('user left the page')), 5);
        return await new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      },
    });
    await expect(client.get('/x', { signal: controller.signal })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('does not call fetch at all if the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already gone'));
    let calls = 0;
    const client = solution.createClient({ fetch: async () => { calls++; return jsonResponse(200, {}); } });
    await expect(client.get('/x', { signal: controller.signal })).rejects.toThrow();
    expect(calls).toBe(0);
  });
});`,
        },
      ],
    },
  ],
});

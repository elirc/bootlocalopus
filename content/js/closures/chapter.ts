import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
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
      hints: [
        'Declare `let count = start` inside the function, then return an object whose methods read and write it.',
        'If you write `return { count, increment }`, the count is a copy on the object — that is exactly what this lesson is testing against.',
      ],
    },
    {
      id: 'js-once-memoize',
      title: 'once() and memoize()',
      kind: 'js',
      xp: 60,
      why: 'Cheap wins against duplicate network calls and re-initialised singletons.',
      tags: ['closures', 'caching', 'higher-order functions'],
      hints: [
        'For `once`, track a `called` boolean plus a `result` variable — do not test `result === undefined`, because the function may legitimately return undefined.',
        'Use `function (...args)` (not an arrow) for the wrapper so `this` is inherited from the call site, then `fn.apply(this, args)`.',
        'For `memoize`, `cache.has(key)` is the check you want; `cache.get(key) !== undefined` breaks for cached undefined values.',
      ],
    },
    {
      id: 'js-this-binding',
      title: 'Debug: the vanishing `this`',
      kind: 'js',
      xp: 55,
      why: 'The single most common "works in isolation, breaks as a callback" bug.',
      tags: ['this', 'debugging', 'methods'],
      hints: [
        '`forEach` takes a second argument: the `this` to use. Or wrap the call in an arrow function, which captures `this` lexically.',
        'For `describe`, a class field holding an arrow function (`describe = (index) => {...}`) is bound per instance and survives being detached.',
      ],
    },
    {
      id: 'js-compose-pipe',
      title: 'pipe, compose, and pipeAsync',
      kind: 'js',
      xp: 60,
      why: 'Middleware, data transforms, and validation chains are all function composition.',
      tags: ['functional', 'higher-order functions'],
      hints: [
        '`reduce` over the function list carrying the running value: `fns.reduce((acc, fn) => fn(acc), first)`.',
        'To let the first function take multiple arguments, seed with `fns[0](...args)` and reduce over `fns.slice(1)`.',
        'For the async version, an ordinary `for...of` loop with `value = await fn(value)` is clearer than reducing over promises.',
      ],
    },
    {
      id: 'js-event-emitter',
      title: 'BOSS: build an EventEmitter',
      kind: 'js',
      xp: 180,
      boss: true,
      why: 'Pub/sub shows up in every layer of the stack. Writing one proves you understand closures, collections, and error isolation.',
      tags: ['closures', 'pub-sub', 'error handling'],
      hints: [
        'Store `Map<string, Function[]>`. In `emit`, copy the array first (`[...handlers]`) so mutations during iteration are safe.',
        'For `once`, wrap the handler in a function that removes itself before calling through, and make `off` able to find it — keep a reference to the original on the wrapper.',
        'Collect thrown errors in an array, and after the loop `if (errors.length) throw new AggregateError(errors, "...")`.',
        'In `off`, after removing, `if (handlers.length === 0) this.#events.delete(event)`.',
      ],
    },
  ],
});

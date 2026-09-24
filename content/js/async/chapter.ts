import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
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
      hints: [
        'Parallel: `Promise.all(ids.map(loadOne))` starts every call immediately because `.map` runs synchronously.',
        'Sequential: a `for...of` loop that pushes `await loadOne(id)` into an array.',
        'For settleAll, map each id to a promise chain that resolves to a wrapper object: `.then((value) => ({ status: "fulfilled", value })).catch((reason) => ({ status: "rejected", reason }))`, then `Promise.all` the wrappers — they never reject.',
        'A synchronous throw from `loadOne(id)` happens before any `.catch` is attached, so it escapes `.map`. Start the chain with `Promise.resolve().then(() => loadOne(id))` (or `try`/`catch` around the call) so the throw becomes a rejection.',
      ],
    },
    {
      id: 'js-event-loop',
      title: 'Event loop order',
      kind: 'quiz',
      xp: 55,
      why: 'Interviewers ask it, and race conditions in real code are explained by it.',
      tags: ['event loop', 'microtasks', 'async'],
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
          explain: 'nextTick and the two microtask forms all drain before the event loop reaches the timers phase. `setImmediate` runs in the check phase — after timers that are already due, so from the main module it does not reliably beat a 0 ms timer. (Inside an I/O callback it is the other way round: the check phase comes next, so `setImmediate` always wins there.)',
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
      hints: [
        'Batching (`chunk` the array, `Promise.all` each chunk) passes the order test but fails the "keeps the pool busy" test — a batch waits for its slowest member.',
        'Instead: `let cursor = 0`, then spawn `Math.min(limit, items.length)` worker loops. Each worker does `while (cursor < items.length) { const i = cursor++; results[i] = await fn(items[i], i); }`.',
        '`cursor++` is safe here: JavaScript is single-threaded, so the read-increment is atomic with respect to other workers.',
        'Await all the workers with `Promise.all(workers)`, then return the results array.',
      ],
    },
    {
      id: 'js-retry-backoff',
      title: 'Retry with backoff',
      kind: 'js',
      xp: 85,
      why: 'Networks fail transiently. Retrying everything, forever, without jitter is how you DDoS yourself.',
      tags: ['async', 'resilience', 'retry'],
      hints: [
        'A `for (let attempt = 1; attempt <= attempts; attempt++)` loop with try/catch is the clearest shape.',
        'On catch: if it was the last attempt, or `!shouldRetry(err, attempt)`, rethrow. Otherwise `await sleep(jitter(baseDelay * factor ** (attempt - 1)), signal)`.',
        'Check `signal?.aborted` before the first call and again after each sleep; throw `signal.reason` when aborted.',
        'An abortable sleep: `new Promise((resolve, reject) => { const t = setTimeout(resolve, ms); signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true }); })` — plus an early `reject` if it is already aborted.',
      ],
    },
    {
      id: 'js-task-queue',
      title: 'BOSS: cancellable task queue',
      kind: 'js',
      xp: 200,
      boss: true,
      why: 'Upload queues, job runners, and request schedulers are all this class. It is a real interview take-home.',
      tags: ['async', 'concurrency', 'cancellation', 'pub-sub'],
      hints: [
        'Store queued entries as `{ task, resolve, reject }`. `push` returns `new Promise((resolve, reject) => { this.#pending.push({ task, resolve, reject }); this.#drain(); })`.',
        '`#drain()` loops while `running < concurrency && pending.length`: shift an entry, increment running, and run it. Do **not** await inside drain — start it and let its `.then` call `#drain()` again.',
        'Wrap the task call so failures only touch that entry: `Promise.resolve().then(() => entry.task(signal)).then(entry.resolve, entry.reject).finally(() => { running--; this.#drain(); this.#checkIdle(); })`.',
        'Keep an array of idle resolvers. In `#checkIdle`, if `running === 0 && pending.length === 0`, resolve and clear them.',
        'For `abort`, call `controller.abort(reason)`, then splice the pending list and reject each entry with the reason. Set an `aborted` flag so later pushes reject.',
      ],
    },
  ],
});

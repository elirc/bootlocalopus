# Review 01: the grading sandbox

Scope: `server/runner/worker.mjs` (600 lines), `server/runner/index.ts` (146 lines), and how `scripts/verify-content.ts` and `scripts/smoke.ts` exercise them. I read all four files completely. Filesystem reach and the 0.0.0.0 bind are covered in `02-server-game-opus.md` §3–4, so I only return to them where the sandbox design changes the answer.

**Method.** Every finding marked *(probed)* was reproduced through the real `runExercise()` using throwaway scripts in my scratchpad (`probes.mts`, `keepalive.mjs`, `tsperf.mjs`, `nocheck.mjs`). I did not change any repo code.

**Measurement caveat.** The machine was saturated during this review: 47 `node` processes and a steady 100% CPU load from other agents. Absolute timings are 3–10× worse than normal. Only the **ratios** below are meaningful. The load had one useful effect: it showed how the fixed budgets behave on a slow machine. `npx tsx scripts/smoke.ts` failed 3 of its 6 "should pass" cases by timeout (typecheck 20 s, sql 25 s, node 10 s), even though the code being graded was correct.

---

## Executive summary

The architecture is sound: a new worker per run, an environment per kind, and a small readable harness. The two "deliberate details" in the README are real, and their implementations work. The problems are in the details a hand-rolled harness has to get exactly right:

1. **The verdict can be forged in one line, three different ways** *(probed)*. Overwrite `globalThis.expect`, post a result on `parentPort`, or patch `Array.prototype.every`. For a single-player app the stakes are low (you only cheat yourself), but it also means the harness has no trusted core. That matters as soon as the planned `mutation` kind lets learners write the tests.
2. **The equality and formatting layer returns wrong grades in both directions** *(probed)*. `toEqual` passes for `Map` vs `{}`, `/a/` vs `/b/`, `Error('a')` vs `Error('b')`, two different `URL`s, and `toMatchObject` with two different `Date`s. It fails `{a:1, b:undefined}` vs `{a:1}` with the message `expected {"a":1} to deeply equal {"a":1}`. `expect(-0).toBe(0)` reports `expected 0 to be 0`. All 15 false-positive probes passed.
3. **Async misuse passes silently** *(probed)*. An un-awaited `.rejects`, `.not.toThrow()` on an async function, and a failing assertion in a timer all pass. `toThrow({status: 400})` and `toThrow(new Error('x'))` accept any error.
4. **The failure paths lose information.** One hung test throws away every completed result. `process.exit(0)` waits the whole budget and then blames "an infinite loop". One `console.log` of a 50 MB string produced a **61 MB** JSON result that goes to the browser. Rejections that fire from a timer bypass the log cap.
5. **The typecheck program loads 194 files where 59 would do**, because `types` and `lib` are left at their defaults. That was 19× slower in my measurement (38 s vs 2.0 s under load), and it is the most likely reason the typecheck smoke cases timed out.
6. **SQL isolation has two holes.** Learner SQL with `BEGIN` and no `COMMIT` makes test 1 pass and every later test fail with `relation "t" does not exist`. A test that commits leaks its rows into later tests. Both can be detected cheaply with `pg_current_xact_id()`.

The refactor (§ Proposed refactor plan) should come *after* items 1–4, because the split is also what makes the fixes testable. For performance: pre-warm workers for kinds that run learner JavaScript, and **reuse** a worker only for `typecheck`, which never executes learner code. Reuse PGlite only behind a verified reset.

---

## Findings

Severity legend: **bug** (wrong grade, hang, crash or misleading message) · **security** · **design** · **perf** · **nit**.

### 1. [bug/security] The grading verdict is forgeable from learner code *(probed)*

Evidence:
- `worker.mjs:292-298` puts the harness on `globalThis` as ordinary writable properties. `worker.mjs:547` imports the learner module **before** the spec (`:555-556`), in the same realm. Probe P1: `globalThis.expect = () => new Proxy(...)` → `ok=true` for `add = (a,b) => a - b`.
- `index.ts:114-120` accepts the **first** non-progress message on the worker's `parentPort` as the verdict. Probe P2: `parentPort.postMessage({ ok: true, tests: [{ name: 'forged', passed: true }] })` → `ok=true`, `PASS forged`.
- `worker.mjs:586` computes `ok` with `results.every(...)` in the learner's realm. Probe P27: patching `Array.prototype.every` gave `ok=true` alongside a result list that showed `FAIL adds`. The UI would show a red test and still award XP.

Why it matters: impact is low today, because this is single-player and the only person cheated is the learner. It stops being low with the `mutation` kind, where learner code *is* the tests, and with any leaderboard or shared-progress feature. More immediately, it shows the harness has no trusted core. Any hardening has to start by creating one.

Recommendation, in order of cost. Honestly assessed, this raises the bar from a one-liner to deliberate effort. In-realm grading can never be airtight.

1. **The parent recomputes the verdict.** `index.ts` must never trust `ok`:
   ```ts
   const tests = Array.isArray(msg.tests) ? msg.tests : [];
   const ok = !msg.error && tests.length > 0 && tests.every((t) => t?.passed === true);
   ```
   This alone defeats P27, because the parent's `Array.prototype` is clean.
2. **Results travel on a private port.** The parent creates a `MessageChannel` and transfers `port2` in its first `worker.postMessage`. The worker receives the port *before* importing any learner code and keeps it in module scope. The parent ignores everything on `worker.on('message')` except a `ready` signal.
   ```ts
   // index.ts
   const { port1, port2 } = new MessageChannel();
   worker.postMessage({ port: port2 }, [port2]);
   port1.on('message', onVerdictOrProgress);
   worker.on('message', () => {}); // anything here came from learner code
   ```
   ```js
   // worker.mjs, first lines
   const port = await new Promise((r) => parentPort.once('message', (m) => r(m.port)));
   const post = Function.prototype.call.bind(MessagePort.prototype.postMessage); // captured before learner code
   // later: post(port, result)
   ```
3. **Lock the globals and capture primordials.** Define the harness and environment globals (`expect`, `it`, `render`, `screen`, `q`, …) with `Object.defineProperty(globalThis, k, { value, writable: false, configurable: false })`. Freeze the matcher objects. An assignment in learner ESM (strict mode) then throws at load, and the learner sees "Your code threw while loading", which is honest. Inside `expect.mjs`/`harness.mjs`, capture `Object.is`, `Object.keys`, `Array.prototype.every/some/map`, `JSON.stringify` and `Promise` at module evaluation, which happens before learner import, as Node's own `primordials` do:
   ```js
   const uncurry = (fn) => Function.prototype.call.bind(fn);
   export const ArrayEvery = uncurry(Array.prototype.every);
   export const ObjectIs = Object.is, ObjectKeys = Object.keys;
   ```
4. **Registering tests before importing the learner module** does *not* help by itself. `expect` is looked up at call time, and a spec that destructures `solution` at top level would break. Locked globals plus primordials is the right mechanism.

### 2. [security] The worker is not a process boundary: the server can be killed, exhausted or read *(probed)*

Evidence:
- The worker shares the server's PID (`keepalive.mjs`: worker `process.pid` equals parent pid 21352). Learner `process.kill(process.pid)` kills the API server.
- `index.ts:84` `resourceLimits: { maxOldGenerationSizeMb: 512 }` caps the V8 heap only. Probe: under a **32 MB** heap limit, a worker allocated **300 MB of `Buffer`s** (rss 389 MB) without complaint. ArrayBuffers and PGlite's WASM memory are off-heap, so a loop of `Buffer.alloc` can OOM the whole server.
- `index.ts:80` does not set `execArgv`, so the worker **inherits tsx's `--require preflight.cjs --import tsx/loader`** (probe P23 printed it). As a result, learner code can `await import('../../content/index.ts')` and get every lesson's `solution` and `tests` as data: no `fs` needed, and it works even from a `.mjs` context. The `execArgv` measurement to quantify the cost of running tsx hooks on every jsdom and typescript import was inconclusive under the load.
- `fs` and `child_process` are fully available (see review 02 §3).

My view for a **local, single-user** app: reading `content/` is cheating yourself, which is acceptable. Writing `data/progress.json`, spawning processes, and taking down the server are not, because they cost the learner their session or their save file. **LAN exposure turns all of this into remote code execution**, so the loopback bind from review 02 is the precondition for anything below to be "acceptable".

Recommendations (cheap to strong):
1. `execArgv: []` in the `Worker` options. This is one line. The worker and all emitted code are plain `.mjs`, so nothing needs tsx.
2. In the worker, **before learner import**, replace the dangerous process methods with ones that throw a teaching message:
   ```js
   for (const k of ['exit', 'kill', 'abort', 'chdir', 'dlopen', 'reallyExit', 'binding', 'getBuiltinModule']) {
     Object.defineProperty(process, k, { value: () => { throw new Error(`process.${k}() is not available in graded code`); },
       writable: false, configurable: false });
   }
   ```
   `getBuiltinModule` must be on this list. Otherwise it bypasses any import blocklist.
3. An import allowlist with the in-thread `module.registerHooks` (Node 22.15+/23.5+, available on the Node 24.19 used here). Its `resolve` hook rejects `node:child_process`, `node:cluster`, `node:worker_threads` (which also kills the P2 forge), `node:vm`, `node:inspector` and `node:v8`, plus any resolved `file:` URL outside `runDir` and `node_modules`. `node:fs` must stay, because node-track lessons use streams and fs. This is a speed bump, not a wall.
4. The real boundary is a child process with Node's permission model: `fork(worker.mjs, { execArgv: ['--permission', '--allow-fs-read=<node_modules>,<runner dir>,<runDir>', '--allow-fs-write=<runDir>', '--max-old-space-size=512'] })`. With it, an OOM or a `process.kill` takes down only the child. It costs roughly one process spawn (~50–150 ms on Windows) on top of the same module imports the worker already pays. The message protocol maps 1:1 (`process.send`). Network is not restricted in Node 24. I would do 1–3 now and 4 only if the app ever leaves localhost or gains shared progress.

### 3. [bug] `deepEqual`/`subsetEqual` give wrong answers in both directions *(probed)*

Evidence (`worker.mjs:60-95`). These all **passed** in probe P5, and every one should fail:

| Assertion | Why it passes |
| --- | --- |
| `expect(new Map([[1,2]])).toEqual({})` | `:70` only handles *both* Maps; otherwise `:81` compares `Object.keys`, and both are `[]` |
| `expect(new Map([[1,2]])).toEqual(new Set())` | same |
| `expect(/a/).toEqual(/b/)` | no own enumerable keys |
| `expect(new Error('a')).toEqual(new Error('b'))` | `message` is non-enumerable |
| `expect(new URL('http://a/')).toEqual(new URL('http://b/'))` | internal slots; the same applies to `Headers`, `Response`, `Blob` and every class with `#private` state |
| `expect({d: new Date(1)}).toMatchObject({d: new Date(2)})` | `:94` recurses into a Date as a plain object with zero keys |
| `new Set([{x:1},{x:1}])` equals `new Set([{x:1},{x:2}])` | `:78` checks "every a has some match in b", not a bijection |
| `expect([0n]).toEqual([''])` | `:64` `BigInt('') === 0n`; `true`, `[]` and `'0x0'` also coerce |
| `toStrictEqual(classInstance, plainObject)` | `:211` aliases `toStrictEqual` to `toEqual` |
| `{[Symbol('k')]: 1}` equals `{}` | `Object.keys` ignores symbols |

False negatives and misleading messages:
- P3: `{a:1, b:undefined}` vs `{a:1}` **fails** (`:82`, key count). Jest's `toEqual` passes it. The message is `expected {"a":1} to deeply equal {"a":1}` because `show()` (`:104`) uses `JSON.stringify`, which drops `undefined`. A learner who returns `{ ...user, nickname: undefined }` when the reference omits the key gets a failure they cannot read.
- P4: `expect(Math.round(-0.4)).toBe(0)` → `expected 0 to be 0`. `[NaN]` shows as `[null]`.
- P6: Maps render as `{}` (`expected {} to deeply equal {}`), and cyclic values as `[object Object]`. Two structurally equal cyclic objects recurse in `deepEqual` until `RangeError: Maximum call stack size exceeded`, because there is no `seen` set.
- Real content affected today: `content/node/index.ts:2571,2655` compare `Date`s with `toEqual`, which works because both sides are Dates. Any `toMatchObject({ createdAt: new Date(...) })` would silently pass.

Recommendation: use Node's built-ins, which need no new dependency.
```js
import { isDeepStrictEqual, inspect } from 'node:util';

export const show = (v) => inspect(v, { depth: 4, maxArrayLength: 30, maxStringLength: 300,
  breakLength: 100, getters: false, compact: 3 });            // -0, NaN, Map, cycles, undefined props, class names

export const strictEqual = isDeepStrictEqual;                  // for toStrictEqual: prototypes, undefined keys, -0

export function looseEqual(a, b, seen = new Map()) {           // for toEqual (Jest semantics)
  if (Object.is(a, b)) return true;
  if (typeof a === 'bigint' || typeof b === 'bigint')          // keep the Postgres convenience, but only numeric
    return (typeof a === 'bigint' || typeof a === 'number') && (typeof b === 'bigint' || typeof b === 'number') && BigInt(a) == b;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const tag = Object.prototype.toString;
  if (tag.call(a) !== tag.call(b)) return false;               // Map vs {} , RegExp vs {}, Array vs {}
  if (seen.get(a) === b) return true; seen.set(a, b);
  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp) return String(a) === String(b);
  if (a instanceof Error && (a.message !== b.message || a.name !== b.name)) return false;
  if (a instanceof URL) return a.href === b.href;
  if (a instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && looseEqual(v, b.get(k), seen));
  if (a instanceof Set) return a.size === b.size && bijection([...a], [...b], seen);
  const keys = (o) => [...Object.keys(o), ...Object.getOwnPropertySymbols(o)].filter((k) => o[k] !== undefined);
  const ka = keys(a), kb = keys(b);
  return ka.length === kb.length && ka.every((k) => looseEqual(a[k], b[k], seen));
}
```
`subsetEqual` should call `looseEqual` for any non-plain object (Date, Map, Set, RegExp, class instances with internal slots) instead of recursing into keys. Decide once whether `toEqual(0, -0)` should pass (Jest says no; this harness says yes). Then **document** the choice in `AUTHORING.md`.

### 4. [bug] Messages are computed eagerly and have side effects *(probed)*

`worker.mjs:120` runs `show(actual)` inside `makeExpect`, which `expect()` calls twice (`:228-229`) for every assertion, passing or failing. `JSON.stringify` invokes own enumerable getters and `toJSON`. Probe P10: `expect(obj).toBeDefined(); expect(count()).toBe(0)` failed with `expected 2 to be 0`, because the getter ran twice. That is a wrong grade for any lesson about lazy or memoised getters. It also serialises a large value on every assertion.

Fix: build messages lazily (`check(pass, () => 'expected ' + show(actual) + ...)`). With `inspect(..., { getters: false })` from finding 3, the side effects disappear even on failure.

### 5. [bug] Async misuse passes silently; `toThrow` ignores its argument in two cases *(probed)*

All of these passed in P5:
- `it('x', () => { expect(p).rejects.toThrow(); })`, with no `await` and a `p` that resolves. The failing assertion becomes an unhandled rejection, and `:30-32` merely logs it. In P5 it was not even logged, because the run finished first.
- `expect(async () => { throw e }).not.toThrow()`. `:202` calls the function, gets a rejected promise, and sees "no throw".
- `setTimeout(() => expect(1).toBe(2))` inside a test.
- `toThrow({ status: 400 })` and `toThrow(new Error('something else'))`. `matchError` (`:216-225`) has no branch for objects, so it accepts **any** error. This matters for the SQL track, where `.rejects.toThrow()` with no argument accepts `relation "authors" does not exist` as proof that a constraint fired (`content/sql/index.ts:193-250`).

And P6: `expect(asyncFn).toThrow('x')` says "returned normally", which is true but useless. `.rejects.toMatchObject` does not exist (`TypeError ... is not a function`), and `.resolves` has only `toBe`/`toEqual`.

Fixes:
```js
// harness: every async matcher registers its promise with the running test
let pending = null;                                   // Set<Promise> for the test in flight
const track = (p) => { pending?.add(p.catch(() => {})); return p; };

// runner, per test
pending = new Set(); inFlightErrors = [];
await t.fn();
const unawaited = [...pending];                       // matcher promises the test never awaited
await Promise.all(unawaited);
await new Promise((r) => setImmediate(r));            // let late timers/rejections land
if (inFlightErrors.length) throw inFlightErrors[0];   // fed by the unhandledRejection/uncaughtException handlers

// toThrow: detect thenables
const r = actual();
if (r && typeof r.then === 'function') bail('this function is async: use `await expect(fn()).rejects.toThrow(...)`');

// matchError: support what Jest supports, and refuse the rest loudly
else if (expected instanceof Error) { if (msg !== expected.message) bail(...); }
else if (expected && typeof expected === 'object') { if (!subsetEqual(err, expected)) bail('expected the error to match ' + show(expected) + ', got ' + show(err)); }
else bail('toThrow() takes a string, RegExp, Error class, Error or object');
```
Build `rejects`/`resolves` generically: settle the promise, then delegate to `makeExpect(value)` for *every* matcher (including `.not`), wrapped with `track()`. Point SQL authors at `rejects.toThrow({ code: '23505' })`. PGlite errors carry the SQLSTATE `code`.

### 6. [bug] Timeouts and early exits lose results and blame the wrong cause *(probed)*

- **One hang discards everything.** P16: tests `a, b, c` passed, then `hangs` never settled. The result was `tests: []` plus a timeout error. The timeout path (`index.ts:99-112`) sends `tests: [], logs: []`. On a 12-test boss the learner loses 11 results and every `console.log`.
- **`process.exit(0)` waits for the full budget.** P14: 45 s, then "An infinite loop, an await that never settles…". `index.ts:131` only reacts to `code !== 0`, and `process.exit()` in a worker exits with 0 (confirmed). `process.exit(1)` gives the right message (P15).
- **The budget includes boot.** `index.ts:99` starts the clock before the worker has imported typescript, jsdom or PGlite. On the loaded machine, smoke timed out on *correct* code: typecheck at 20 s, sql at 25 s, and even `node http server` at 10 s. A learner on a slow laptop with a cold disk cache gets told their correct code has an infinite loop.
- `worker.on('error')` (`:121`) also drops logs, including on `ERR_WORKER_OUT_OF_MEMORY`.

Fixes:
1. **Stream results.** `progress` already exists (`worker.mjs:565`). Add `{ type: 'result', test }` after each test and `{ type: 'log', entry }` (rate-limited). The parent accumulates them, so every exit path (timeout, error, early exit) reports what finished, marks the in-flight test `timed out`, and lists the rest as `not run`.
2. **Treat any exit before a verdict as a failure, immediately**, whatever the code: `worker.on('exit', (c) => finish({... error: c === 0 ? 'Your code ended the sandbox (process.exit()) before the tests finished.' : ...}))`. `finish` is already idempotent.
3. **Split the budget.** The worker posts `{ type: 'ready' }` after its environment is set up. The parent uses a generous setup budget (60 s, with the message "the grader took too long to start, not your code") and then the per-kind test budget, starting at `ready`.
4. **Per-test timeout inside the worker** for async hangs (`Promise.race` with a ref'd timer, default 5 s, overridable per lesson). The worker reports `hangs: timed out after 5 s` and moves on. Only synchronous infinite loops then need the parent to kill the worker.

### 7. [bug] Output is unbounded *(probed)*

- `MAX_LOGS = 200` (`:40`) limits *entries*, not bytes. P12: `console.log('x'.repeat(5e7))` plus a 200 k-element array produced a **61,489,019-byte** result. It is structured-cloned to the parent, serialised by `res.json`, and rendered by the UI.
- `:31` and `:34` push without checking `MAX_LOGS`. P13: a 1 ms interval that rejects produced 35 entries in about 1 s under load; at normal speed it would be about 1,000 per second, without bound.
- `fmt` (`:41-48`) prints `new Error('boom')` as `{}`, `undefined` and functions as empty strings, `new Map` as `{}`, and `NaN` as `null` (P11). `console.error(err)` is the most common debugging line a learner writes, and it prints `{}`.
- `process.stdout.write` bypasses the capture entirely. The parent sets `stdout: true` (`index.ts:85`) but never reads the stream, so the output is silently lost.

Fix: one `pushLog(level, text)` that every path uses, with limits of 200 entries, 2 KB per entry and 64 KB total. It also counts the dropped entries and appends `… 1,834 more log lines dropped`. Format each value with `inspect` from finding 3 (`maxStringLength` bounds the work *before* the string is built). Pipe `worker.stdout` into the same capture (`worker.stdout.on('data', …)`) in the parent.

### 8. [bug] SQL transaction isolation: learner `BEGIN`, test `COMMIT`, multi-statement `q` *(probed)*

- P18: with learner SQL `begin; create table t (x int); insert …;` (no `commit`), `one` **passes** and `two` and `three` **fail** with `relation "t" does not exist`. The harness `begin` (`:433`) is a no-op warning inside the learner's open transaction. The first `rollback` (`:436`) then unwinds the *learner's DDL*. The message points nowhere near the cause.
- P19: a test that runs `db.exec('commit')` (or `db.transaction(...)`, which commits) leaks its rows into the next test (`expected 1 to be 0`).
- P20: `q(userSql)` (used around 20 times in `content/sql`) fails with `cannot insert multiple commands into a prepared statement` when the learner writes two statements. Correct SQL gets a baffling error. Sequences leaking across tests and aborted transactions are documented in `AUTHORING.md`. Harness-level fixes are cheap anyway (see below).

Fix: pin the transaction to a known xid and check it afterwards.
```js
let txid;
rootSuite.before.push(async () => {
  await db.exec('begin');
  txid = (await db.query('select pg_current_xact_id()::text as x')).rows[0].x;   // forces an xid
});
rootSuite.after.push(async () => {
  let intact;
  try { intact = (await db.query('select pg_current_xact_id_if_assigned()::text as x')).rows[0].x === txid; }
  catch { intact = true; }                                   // "current transaction is aborted" = still ours
  await db.exec('rollback').catch(() => {});
  if (!intact) { await restoreSnapshot(); throw new AssertionError('This test ended the grading transaction (COMMIT/ROLLBACK). Later tests would have seen its data.'); }
});
```
Run the same check once after the up-front learner SQL (`:429`). If `pg_current_xact_id_if_assigned()` is non-null there, the learner left a transaction open. Report that as the learner's error ("Your SQL starts a transaction with BEGIN but never COMMITs"), rather than letting tests fail mysteriously. `restoreSnapshot` can use `db.dumpDataDir()` taken after fixtures and learner SQL, plus `PGlite.create({ loadDataDir })`. That costs one extra boot, and only on the broken path.

Optional author convenience: make `q()` use a savepoint (`savepoint g; …; release g` or `rollback to g` on error), so an expected rejection no longer poisons the rest of the test. Also give `q` a multi-statement fallback: `db.exec` when `params` is absent, returning the last result's rows.

### 9. [perf/bug] The typecheck program loads every `@types` package and the DOM lib *(measured)*

`worker.mjs:466-474` sets neither `types` nor `lib`. `createCompilerHost` therefore pulls in `lib.es2022.full.d.ts` (which includes DOM) **and all 19 packages under `node_modules/@types`**: node, react, react-dom, express and its 9 dependencies, and 4 `babel__*` packages. Same machine, same load, a two-file program (`tsperf.mjs`):

| Options | Source files | Time |
| --- | --- | --- |
| default (current) | 194 | 37.9 s (23.7 s second run) |
| `types: []` | 65 | 6.1 s |
| `types: [], lib: ['lib.es2022.d.ts']` | 59 | **2.0 s** |
| same, lib SourceFiles cached (persistent worker) | 59 | 1.26 s |

This explains the smoke `typecheck` timeouts at 20 s. It also has a correctness side: learner code type-checks against Node, Express and DOM globals, so `const x: Request = …` means *something*, and a learner is never told they used an ambient type the lesson did not intend.

Fix: `types: []`, `lib: ['lib.es2022.d.ts']`, with an opt-in per lesson for `dom`/`node` if one ever needs it. Also include `program.getOptionsDiagnostics()` and `getGlobalDiagnostics()`. Today an invalid option combination would produce zero diagnostics, which counts as a **pass**.

### 10. [bug/design] Typecheck lessons cannot enforce what their briefs promise *(probed)*

- `@ts-nocheck`, `@ts-ignore` and `@ts-expect-error` in the **learner's** file suppress errors there. `nocheck.mjs`: `// @ts-nocheck` + `function f(x: string): number { return x }` → the TS2322 disappears. The spec file is still checked, so the learner cannot fake the *exported types*. They can fake any "make this implementation compile" lesson.
- `ts-narrowing` (`content/ts/index.ts:28`) says "no `any` and no type assertions (`as`)", and `describe()` should return `"string: hi"` and so on. Nothing checks either. `typecheck` never runs code (`worker.mjs:525-528`), so `describe = () => ''` passes.

Fix, cheap because the `Program` already exists: walk the learner's `SourceFile` and emit synthetic failing "tests" for suppression comments (`ts.getLeadingCommentRanges` / a regex on `// @ts-`), `AsExpression`/`TypeAssertion` and `AnyKeyword`. Gate them with a lesson field (`forbid?: ('as' | 'any' | 'ts-suppress')[]`). Then allow a **hybrid**: if a typecheck lesson also has `runtimeTests`, transpile and run them through the `ts` path after `tsc` passes.

### 11. [bug] React environment: cross-realm Event classes and state leaking between tests *(probed)*

- `setupDom` skips any key already in `globalThis` (`:352`). As a result `Event`, `CustomEvent`, `EventTarget`, `AbortController`, `URL` and `Blob` are **Node's**, not jsdom's. P22: `el.dispatchEvent(new Event('x'))` and `new CustomEvent('y')` both throw `parameter 1 is not of type 'Event'`. `addEventListener(type, fn, { signal })` with a Node `AbortSignal` is the same cross-realm problem, and it is common in effect-cleanup code.
- P22: `localStorage` and `document.title` persist from one test to the next. This matches Jest within a file, but these are exactly the leaks a learner cannot diagnose.
- RTL auto-registers `afterEach(cleanup)` because a global `afterEach` exists when it is imported. `:384` then pushes a second one. That is harmless but redundant.

Fix: explicitly override the event family from jsdom (`Event`, `CustomEvent`, `EventTarget`, `KeyboardEvent`, `MouseEvent`, `FocusEvent`, `InputEvent`, `AbortController`, `AbortSignal`). Keep Node's `fetch`, `URL` and `Headers`, and add a smoke case proving `fetch(url, { signal })` still works with jsdom's `AbortSignal`. If it does not, keep Node's `AbortController` and document that. Add to `rootSuite.after`: `localStorage.clear(); sessionStorage.clear(); document.title = ''; document.head.innerHTML = ''; history.replaceState(null, '', '/')`.

### 12. [design] Registration edge cases *(probed)*

P17: `describe('outer', async () => { …; await null; it('late one') })` registers `late one` **outside** `outer`: its name lost the prefix, and it ran with root hooks only. An `it()` called inside a running test registered a `ghost` test that ran later, because `registered` is iterated live (`:562`). `afterEach` errors are swallowed (`:581`), so an author's `afterEach(() => expect(errors).toEqual([]))` can never fail. There are no `beforeAll`/`afterAll`.

Fix: throw if `describe`'s callback returns a thenable ("describe callbacks must be synchronous"). Set `running = true` before the loop, and throw from `it`/hooks while it is set. Report author `afterEach` failures as a test failure: keep the swallow only for the harness's own rollback/cleanup hooks by tagging them. Add `beforeAll`/`afterAll`; they are cheap with the suite tree.

### 13. [nit] The heartbeat comment describes the wrong mechanism; 20 ms is unnecessary *(probed)*

`keepalive.mjs`. Without a ref'd handle, a worker awaiting `AbortSignal.timeout(200)` does not "never wake": it **exits** (code 13 for an unsettled top-level await; for `main()`'s pending promise it would be a silent code 0, which then hits finding 6's `exit(0)` hole). A `setInterval(() => {}, 2 ** 30)` works identically to the 20 ms one (both fired at ~200 ms) and never wakes the thread. Fix the comment ("an unref'd timer does not keep the loop alive; without a ref'd handle the worker exits while tests are still pending") and use a 2^30 ms interval.

### 14. [nit] Smaller items

- Stacks point into **compiled** output (`cleanStack`, `:513-519`). For `ts`/`react` lessons the line numbers do not match the editor. Fix: `inlineSourceMap: true, inlineSources: true` in `compile()` and `process.setSourceMapsEnabled(true)` in the worker.
- `useDefineForClassFields: false` (`:308`) gives non-standard class-field semantics in a curriculum that teaches JavaScript. Remove it unless a lesson needs it.
- `ts` lessons are transpiled only, never type-checked. The README states this, but learners will assume type errors count.
- A spec that throws at import because of the *learner's* module (for example a top-level `const { f } = solution; f()`) is reported as "The grader failed to load (lesson bug)" (`:558`).
- `toHaveProperty` on a primitive throws `Cannot use 'in' operator` (P6). `toContain` on iterables other than Array or Set reports `expected {} to contain 1` (P6). `toMatch(/x/g)` is stateful through `lastIndex`.
- `import ts from 'typescript'` at the top of the worker (`:13`) is paid on SQL runs, which never compile. Use `await import('typescript')` lazily.
- `content/types.ts:47` documents `runUserSql()`, which does not exist (it is `execUser`/`queryUser`).

### 15. [design] `verify` and `smoke` do not guard the sandbox

- `smoke.ts:120` only checks that expected passes pass. It never checks that the failure cases fail *for the right reason*. There is also no case for the two README "deliberate details" (the heartbeat and SQL isolation), so either could regress silently.
- `verify-content.ts:209-221` counts a starter as "correctly failing" even if it timed out or failed in `phase: 'grader'`. A starter that times out makes every learner wait 10–25 s on their first Run. The script also accepts a reference solution that used 95% of its budget, which will flake on slower machines.

Fix: make smoke table-driven with `expect: { ok, phase?, timedOut?, failing?: string[] }`, and add these cases: the P1/P2/P27 forgeries (must fail), `process.exit(0)` (must fail fast, well under budget), an un-awaited `.rejects`, the P5 equality table, `AbortSignal.timeout` (heartbeat), a SQL test that inserts (next test sees 0 rows), learner `BEGIN` without `COMMIT`, a 10 MB log (result under 100 KB), and a hung test after 3 passing tests (3 results kept). In `verify`, fail when a starter's failure is `timedOut` or `phase === 'grader'`, and warn when the reference `ms > 0.5 × budget`.

---

## Performance: what to do about PGlite (~2–3 s) and tsc (~2 s)

| Option | Gain | Complexity | Isolation risk | Verdict |
| --- | --- | --- | --- | --- |
| Fix `types`/`lib` (finding 9) | typecheck: 194 → 59 files, 5–19× measured | 2 lines | none | **Do first** |
| Lazy `typescript` import in SQL runs | ~0.3–1 s per SQL run | 1 line | none | Do |
| **Persistent typecheck worker** (cache lib `SourceFile`s, pass `oldProgram`) | 2.0 → 1.26 s measured under load; more when warm | ~60 lines | **none: tsc never executes learner code**. A pathological type only hangs this worker; kill and respawn | **Do** |
| **Pre-warmed single-use workers** (boot, import, create jsdom or PGlite, post `ready`, wait for the run, then die) | hides import + PGlite boot (2–3 s) + jsdom create from the learner's wait | ~100 lines in `index.ts`; requires the per-run harness factory | none (still one worker per run) | **Do for sql/react**. Warm one spare for the kind of the lesson *currently open* (the UI's lesson GET is the hint), not one per kind: that would hold ~150 MB of PGlite plus ~60 MB of jsdom idle |
| Persistent PGlite, reset with `DROP SCHEMA public CASCADE; CREATE SCHEMA public` | ~2–3 s → ~50–100 ms | ~120 lines + reset verification | **Real**: the reset misses other schemas, roles, `ALTER DATABASE … SET`, `SET` GUCs, temp tables, prepared statements, extensions, and sequences outside `public` | Only with a stronger reset (drop every non-system schema, drop roles with `oid >= 16384`, `DISCARD ALL`), **followed by a catalog fingerprint check** (counts from `pg_class`/`pg_namespace`/`pg_roles`/`pg_proc` must equal the baseline, or the worker is discarded). Acceptable because learner *JavaScript* never runs in SQL lessons, only trusted spec JS. Second priority, after pre-warming |
| Persistent worker for js/react/node | largest in theory | the harness factory plus resetting globals, prototypes, timers, servers and module state | **Unacceptable**: learner JS can pollute the realm (finding 1), and "it passed on the second Run" is the worst bug a grader can have | **Don't** |

Recommendation: fix `types`/`lib`, lazy-load typescript, add the persistent typecheck worker, then pre-warm single-use workers for sql and react. Reuse PGlite only if measurements after pre-warming still show SQL as the bottleneck.

---

## Proposed refactor plan

Plain `.mjs`, no build step. `server/runner/sandbox/` is imported by `worker.mjs`. Each module is a factory, so a persistent or mutation worker can create a fresh harness per run.

```
server/runner/
  worker.mjs            orchestration only (~120 lines)
  sandbox/
    primordials.mjs     export const ObjectIs, ObjectKeys, ArrayEvery, ArraySome, JSONStringify, PromiseCtor, uncurry
    format.mjs          export function show(v); export function createLogSink({ maxEntries, maxEntryBytes, maxTotalBytes }) → { push(level, args), entries(), dropped() }
    equality.mjs        export function looseEqual(a, b); export const strictEqual; export function subsetEqual(obj, subset)
    expect.mjs          export class AssertionError; export function matchError(err, expected);
                        export function createExpect({ onAssertion, track }) → expect   // onAssertion counts calls (needed by the mutation kind)
    harness.mjs         export function createHarness({ perTestTimeoutMs, onTestStart, onTestResult }) →
                          { api: { describe, it, test, beforeEach, afterEach, beforeAll, afterAll }, addRootHook(kind, fn, { internal }), run(): Promise<TestResult[]> }
    compile.mjs         export function transpile(source, fileName, { jsx }); export async function emit(dir, name, source) → url
    guard.mjs           export function lockProcess(); export function installImportPolicy({ runDir, nodeModules }); export function defineLocked(obj)
    envs/dom.mjs        export async function setupDom(harness) → { globals, teardown }
    envs/postgres.mjs   export async function setupPostgres({ fixtures, code }, harness) → { globals, snapshot, dispose }
    envs/typecheck.mjs  export function createTypechecker({ cacheLibs }) → { check({ code, tests, dir, forbid }): TestResult[] }
```
The `worker.mjs` flow is: receive the private port → `lockProcess()` / `installImportPolicy()` → `createLogSink` → `createHarness` → env setup → `defineLocked(globalThis, {...harness.api, expect, ...env.globals})` → post `ready` → compile and import learner → compile and import spec → `run()` streaming results → post verdict.

Order of work (each step ships on its own):
1. **Guard rails in the smoke suite** (finding 15), written against current behaviour, so each later step turns a red case green.
2. `index.ts`: recompute `ok`, treat exit before a verdict as failure, `execArgv: []`, stream results, split the setup and test budgets (findings 1.1, 6, 2.1).
3. Extract `format.mjs` + `equality.mjs` + `expect.mjs` with the `inspect`/`looseEqual`/lazy-message/async-tracking fixes (findings 3, 4, 5, 7). Run `npm run verify` to catch any lesson that relied on the old looseness.
4. Extract `harness.mjs` as a factory with the per-test timeout, registration guards and `beforeAll`/`afterAll` (findings 6.4, 12).
5. `primordials.mjs` + `guard.mjs` + private port + locked globals (findings 1.2–1.3, 2.2–2.3).
6. `envs/*` extraction with the SQL xid check, the DOM event-family fix and resets, and typecheck `types`/`lib` plus `forbid` (findings 8, 9, 10, 11).
7. Performance: the persistent typecheck worker, then pre-warmed sql/react workers.
8. The `mutation` kind (below), which depends on steps 2, 4 and 5.

---

## Mutation kind design

**Content model** (`content/types.ts`):
```ts
kind: 'mutation';
env: 'js' | 'ts' | 'react' | 'node';     // which environment the implementations run in
impl: string;                            // the correct implementation (hidden)
equivalents?: string[];                  // refactors with identical behaviour: every learner test must PASS them too
mutants: { id: string; behaviour: string; code: string }[];   // behaviour = what the bug changes, shown when it survives
starter: string;                         // a test skeleton
solution: string;                        // the reference test suite
minTests?: number;                       // default 3
```

**Why one worker per implementation, not a loop inside one worker.** An off-by-one mutant such as `while (i <= n)` can spin **synchronously** forever on an input the learner chose. No in-thread timeout can interrupt that, so a loop in one worker would lose the whole run. Stryker counts a timed-out mutant as *killed*, and this design can only do the same if the mutant is killable in isolation. The cost is N+1 js worker boots. The smoke `js` cases took 0.4–0.9 s each under load, so 1 correct + 6 mutants + 2 equivalents at a concurrency of 3 is about 3 rounds, roughly 2–3 s. React is slower, about 2 s per worker normally, so 6–8 s. Pre-warmed workers cut that directly.

**Worker changes** (small, because the learner's spec is just `tests`):
- `workerData` gains `mutation: { wrapExports: true, requireAssertions: true, quiet: boolean }`.
- The learner's spec is compiled with the existing `transpile()` as `spec.ts`/`spec.tsx`. It references `solution`, exactly like a normal grader.
- `code` is the implementation under test (the correct one, an equivalent or a mutant). The worker imports it and then, if `wrapExports` is set, exposes a wrapped namespace. That way `solution.fn.toString()` looks identical for every implementation, and learner tests cannot fingerprint the correct source:
  ```js
  const wrap = (v) => typeof v !== 'function' ? v
    : /^class\b/.test(Function.prototype.toString.call(v)) ? v      // classes: see the limitation below
    : function wrapped(...a) { return new.target ? Reflect.construct(v, a, new.target) : v.apply(this, a); };
  globalThis.solution = Object.freeze(Object.fromEntries(Object.entries(ns).map(([k, v]) => [k, wrap(v)])));
  ```
  Classes still leak their source. That is acceptable: this is a learning app, and the goal is "no accidental giveaway", not a proof of secrecy.
- `requireAssertions`: `createExpect({ onAssertion })` counts calls per test. A test with zero assertions fails with "this test asserts nothing". A suite of `it('x', () => {})` then cannot pass against the correct implementation, and the ≥`minTests` rule is enforced by the orchestrator.
- `quiet`: mutant and equivalent runs drop logs. Otherwise `console.log(solution.fn)` in the correct run or a mutant run reveals code. Logs are kept only for the correct implementation, whose exported functions are wrapped.

**Orchestration** (`server/runner/mutation.ts`, calling `runExercise` for each implementation):
```ts
export async function runMutation(lesson, learnerSpec): Promise<MutationResult> {
  const base = { kind: lesson.env, tests: learnerSpec, mutation: { wrapExports: true, requireAssertions: true } };
  // 1. Correct implementation: every learner test must pass. Otherwise the tests are wrong; stop here.
  const correct = await runExercise({ ...base, code: lesson.impl, mutation: { ...base.mutation, quiet: false } });
  if (!correct.ok || correct.tests.length < (lesson.minTests ?? 3))
    return { ok: false, stage: 'correct', correct, verdict: 'Your tests must pass against a correct implementation first.' };
  // 2. Budget per implementation, derived from the correct run.
  const budget = Math.min(10_000, Math.max(2_000, 3 * correct.ms + 1_000));
  const run = (code) => runExercise({ ...base, code, timeoutMs: budget, mutation: { ...base.mutation, quiet: true } });
  // 3. Equivalents must pass (tests that pin implementation details fail here).
  const equivalents = await pool(lesson.equivalents ?? [], 3, run);
  // 4. Mutants: killed = at least one test failed OR the run timed out/crashed.
  const mutants = await pool(lesson.mutants, 3, async (m) => {
    const r = await run(m.code);
    const killer = r.tests.find((t) => !t.passed)?.name;
    const status = r.timedOut ? 'killed (timeout)' : killer || r.error ? 'killed' : 'survived';
    return { id: m.id, status, killedBy: killer ?? null, hint: status === 'survived' ? m.behaviour : null };
  });
  const ok = equivalents.every((e) => e.ok) && mutants.every((m) => m.status !== 'survived');
  return { ok, correct, equivalents: equivalents.map((e) => ({ ok: e.ok })), mutants, score: `${mutants.filter((m) => m.status !== 'survived').length}/${mutants.length}` };
}
```
The `RunResult` shown to the UI maps into the existing shape. `tests` has one row for "passes on a correct implementation", one row per equivalent ("passes on refactor #2 (not over-specified)") and one row per mutant ("catches: *returns stale data when the TTL is exactly 0*", with `passed = killed`). The UI then needs no special case. Mutant code is never sent. A mutant that errors at load (`phase: 'load'`) should count as a **content bug**, not a kill, and `verify` must reject it.

**Timeouts.** Each implementation has its own budget (above), plus the per-test timeout from finding 6. The whole run is capped at about 30 s: the orchestrator stops launching new mutants past the cap and reports the rest as `not run`, never as survived. The `/run` handler must not also apply the single-run budget.

**`verify-content.ts` rules for this kind:** the reference suite (`solution`) passes on `impl` and every equivalent, and kills every mutant. The starter kills none, or at least does not pass. Each mutant is killed by the reference suite **by a failing assertion, not only by a timeout**, which proves the mutant differs in behaviour an author can describe. And the correct run's `ms` is under a third of the mutant budget floor.

# Review 01 (adversarial pass): the grading sandbox

Scope: an adversarial verification of `upskilling/reviews/01-sandbox-opus.md` against the **committed** sandbox (`git show HEAD:server/runner/worker.mjs`, `HEAD:server/runner/index.ts`, `HEAD:server/index.ts`). The working tree is mid-rewrite, so nothing here refers to the working copies.

**Method.** Every claim marked *(reproduced)* ran through a plain-JS replica of the committed `runExercise()` (`driver.mjs`, identical line-for-line to `index.ts` at HEAD, including the timer/message/exit handling) driving a byte-for-byte copy of the committed `worker.mjs`, placed under the gitignored `.runs/probe-fable/`. Probes: `p1-forge`, `p2-equality`, `p3-exit-sql-heartbeat`, `p4-sql-commit`, `p5-tsperf`, `p6-execargv` (+`p6b/c/d`), `p7-hooks`, `p8-heartbeat`, `p9-misc`, `p11-mem`, `p12-content-strict`, `p13-nocheck`, `p14-tsxflake`. No repo file was modified; the probe directory is deleted at the end.

**Machine.** Same caveat as Opus: 100% CPU throughout (25–34 other `node` processes, ~2.2 GB of 16 GB free, 8 logical cores). Absolute times are 3–10× worse than idle; ratios and orderings are meaningful, absolute values are not.

---

## Reliability verdict on the Opus review

**Reliable on facts, over-built on design.** 14 of 15 findings reproduce exactly as described; the equality table (10/10 false positives), all three forgeries, the SQL holes, the `process.exit(0)` hole, the getter side effect and the registration edge cases all hold. Two things are wrong, one is misattributed, and two line references point at code that does not exist at HEAD:

- **Wrong:** "`execArgv: []` … learner code can no longer `import('../../content/index.ts')`." Node 24.19 strips types natively, so the import succeeds with an empty `execArgv` *(reproduced)*. The flag that blocks it is `--no-experimental-strip-types`, and `fs.readFileSync` reads the same file regardless.
- **Misattributed:** the smoke timeouts on correct code were blamed on load. Under a tsx-launched parent (the only way the server runs: `tsx server/index.ts`) the worker inherits `--import tsx/loader`, and runs then hang intermittently at any size — a trivial `add` test, a `node http` case, and *every* run that contains a dynamic `import()` some of the time *(reproduced, numbers below)*. With `execArgv: []`, zero hangs in the same session. This is the most important thing Opus's review got wrong, because it turns `execArgv: []` from a "cheap speed bump" into the single most valuable line in the whole plan.
- **Wrong reference:** `verify-content.ts:209-221` — the committed file is 95 lines; the substance (a timed-out starter counts as "correctly failing") is right, at lines 63–75.
- **Overstated:** "`new CustomEvent('y')` throws" — construction does not throw; only dispatching a Node-realm event into a jsdom target does. And "19× slower" was a load artefact: I measure 8× (17.2 s → 2.1 s cold, 7.1 s → 0.9 s warm), still decisive.
- **Missed:** a one-line learner DoS that kills the API process, the two channels that leak the hidden implementation in the mutation design, and the flaky-hang cause above (full list under "What Opus missed").

---

## Per-finding verdict table

| # | Opus finding | Verdict | Evidence (mine) |
| --- | --- | --- | --- |
| 1 | Verdict forgeable: `globalThis.expect`, `parentPort.postMessage`, `Array.prototype.every` | **CONFIRMED** | *(reproduced, `p1-forge`)* wrong `add` → baseline `ok=false`. F1 `globalThis.expect = () => Proxy` → `ok=true, PASS adds`. F2 `parentPort.postMessage({ok:true,tests:[{name:'forged',passed:true}]})` → `ok=true, PASS forged, ms=1`. F3 `Array.prototype.every = () => true` → `ok=true` with `tests: [FAIL adds]`. Plus a fourth: F4 `globalThis.it = (n, fn) => real(n, () => {})` → `ok=true, PASS adds`. |
| 2 | Not a process boundary; heap-only limit; tsx `execArgv` inherited; `.ts` content importable | **CONFIRMED / partly WRONG** | Same PID as parent *(reproduced)*. 32 MB heap limit, 300 MB of `Buffer` allocated: rss 370 MB, heap 4 MB, no error *(reproduced)*. tsx parent → worker `execArgv` = `--require preflight.cjs --import loader.mjs` *(reproduced)*. **But** `execArgv: []` still imports `content/index.ts` (6 tracks, solutions readable) because of native type stripping; only `--no-experimental-strip-types` blocks it, and `fs` reads 83,588 bytes of `content/js/index.ts` either way *(reproduced)*. |
| 3 | Equality wrong both directions | **CONFIRMED** | *(reproduced, `p2-equality`)* PASS on all of: Map vs `{}`, `/a/` vs `/b/`, `Error('a')` vs `Error('b')`, two URLs, `toMatchObject` with two Dates, Set non-bijection, `[0n]` vs `['']`, symbol keys, Map vs Set, class vs plain under `toStrictEqual`, two different `Headers`. FAIL on `{a:1,b:undefined}` vs `{a:1}` with message `expected {"a":1}`; `-0` reported as `expected 0 to be 0`; cyclic → `RangeError: Maximum call stack size exceeded`. |
| 4 | Eager `show()` runs getters twice | **CONFIRMED** | `expect(o).toBeDefined(); expect(n).toBe(0)` → `expected 2 to be 0` *(reproduced)*. |
| 5 | Async misuse passes; `toThrow(object)` accepts anything | **CONFIRMED** | `toThrow({status:400})` on `Error('other')` PASS; `expect(async () => {throw}).not.toThrow()` PASS; un-awaited `.rejects` on a resolving promise PASS; `setTimeout(() => expect(1).toBe(2))` PASS with no log *(reproduced)*. |
| 6 | Timeouts lose results; `exit(0)` waits the budget; budget includes boot | **CONFIRMED** | `process.exit(0)` with a 6 s budget → returned at 6,769 ms, `timedOut: true`, "infinite loop" message; `process.exit(1)` → 2,647 ms, correct message *(reproduced)*. Two passes then a hang → `tests: []` *(reproduced)*. Budget-before-boot: by construction (`setTimeout` is armed before `new Worker`), and the SQL smoke took 6.9–20.5 s to boot on this machine. |
| 7 | Output unbounded; `fmt` prints `{}` for errors; stdout lost | **CONFIRMED** | `console.log('x'.repeat(5e6))` → 5,000,482-byte result. `console.error(new Error('boom'))` → `{}`; `undefined, fn, Map, NaN, -0` → `"  {} null 0"`; `process.stdout.write('LOST?')` absent from logs *(reproduced)*. |
| 8 | SQL: learner `BEGIN`, test `COMMIT`, multi-statement `q` | **CONFIRMED** | Learner `begin; create table t…` (no commit) → `PASS one, FAIL two/three: relation "t" does not exist`. Test `db.exec('insert…; commit')` → next test `expected 1 to be 0`. `q('select 1; select 2')` → `cannot insert multiple commands into a prepared statement`. `db.exec('begin')` inside the harness transaction only warns *(all reproduced, `p3`/`p4`)*. Plain inserts *are* isolated (README claim holds). |
| 9 | Typecheck loads 194 files; 19× slower; options diagnostics ignored | **CONFIRMED, ratio OVERSTATED** | `p5-tsperf`, 100% load, 2 reps: default **194 files, 17,179 / 7,078 ms**; `types: []` **65 files, 4,893 / 2,122 ms**; `types: [] + lib es2022` **59 files, 2,130 / 899 ms**; `types: ['node'] + lib es2022` 164 files, 8,485 / 3,510 ms. So ~8× and `@types/node` alone is 105 of the files; the DOM lib is 6. Invalid combo (`module: CommonJS` + `Bundler`) → 0 syntactic/semantic errors, 1 options diagnostic → **counts as a pass today** *(reproduced)*. Current options produce 0 options/global diagnostics, so adding them is safe. None of the 10 typecheck lessons references a Node or DOM ambient global (grep of starter+solution+tests), so `types: []` breaks nothing. |
| 10 | `@ts-nocheck` suppresses; stubs pass | **CONFIRMED** | `// @ts-nocheck` + `return x` as `number` → `ok=true` (54 s under load); control without it → `TS2322`; `export const describe = () => ''` passes its type-level spec *(reproduced, `p13`)*. |
| 11 | Cross-realm Events; state leaks between tests | **CONFIRMED, one detail overstated** | `el.dispatchEvent(new Event('x'))` → `parameter 1 is not of type 'Event'`; `addEventListener(…, { signal })` with Node's `AbortController` → `dictionary has member 'signal' that is not…`; `Event === window.Event` → false; `localStorage` value survives into the next test *(reproduced)*. `new CustomEvent('y')` alone does **not** throw. |
| 12 | Registration edge cases; `afterEach` swallowed | **CONFIRMED** | `late one` registered at root (lost `outer ›` prefix, ran without the suite hook), `ghost` test registered from inside a test ran, and `afterEach(() => expect(1).toBe(2))` had no effect: `ok=true` *(reproduced, `p9`)*. |
| 13 | Heartbeat comment describes the wrong mechanism; 2^30 works | **CONFIRMED, nuance** | Without a ref'd handle the worker **exits with code 0 after 317 ms** while `AbortSignal.timeout(200)` is pending; 20 ms and 2^30 ms intervals both fire the abort at ~220 ms *(reproduced, `p8`)*. Nuance: because the parent ignores exit code 0 (finding 6), the observable outcome is exactly what the comment says ("hang until the parent kills us"); only the mechanism sentence is wrong. |
| 14 | Smaller items | **CONFIRMED (by reading)** | `toHaveProperty` on a primitive → `TypeError: Cannot use 'in' operator…`; `toContain` on a Map → `expected {} to contain 1` *(reproduced)*. `content/types.ts` documents `runUserSql()` at line 55 (not 47). Stack cleaning, `useDefineForClassFields`, eager `typescript` import: by reading. |
| 15 | `verify`/`smoke` do not guard | **CONFIRMED, wrong line numbers** | `verify-content.ts:63-75`: `if (starter.ok) … else '.'` — a timed-out or grader-crashed starter counts as sound. No `ms`-versus-budget check anywhere. `smoke.ts:120` only asserts expected passes. |
| P | Performance table | **UNVERIFIABLE here** (persistent-worker gains) / plausible | I did not build a persistent typecheck worker. The 194→59 gain is verified above; the rest is reasoning. See challenges. |
| M | Mutation-kind design | **Design; two leaks it does not close** | See "What Opus missed" 3 and "Challenges". |

---

## What Opus missed

1. **A one-line learner DoS kills the API server** *(reproduced, `p1-forge` F6)*. `import { parentPort } from 'node:worker_threads'; parentPort.postMessage(null)` from learner code → `index.ts:114` runs `msg.progress` on `null` → `TypeError: Cannot read properties of null (reading 'progress')` thrown inside an `EventEmitter` listener → **uncaught exception in the parent process**. My driver caught it via `process.on('uncaughtException')`; the real server has no such handler (`git show HEAD:server/index.ts` has none), so Express dies and the learner's session is gone. `postMessage(undefined)`, `postMessage(1)` and `postMessage('x')` do the same. This is strictly worse than the three forgeries: it is not "cheating yourself", it is losing the server. It is also trivial to hit by accident (any lesson where a learner experiments with `worker_threads`). Fix is in MUST-1 below.

2. **The flaky hangs are the tsx loader in the worker, not load** *(reproduced, `p6c/p6d/p14`)*. Under a tsx parent with inherited `execArgv`, in one session: trivial js 1/6 timed out, learner `await import('node:fs')` 1/3, spec `await import('node:path')` 1/3, `node http` 1/2 — [P14_TSX_SUMMARY]. Under plain `node`, and under tsx with `execArgv: []`, [P14_CLEAN_SUMMARY]. Opus's smoke run "failed 3 of 6 should-pass cases by timeout" and blamed the machine; the machine is the same now and `execArgv: []` makes the timeouts disappear. Every learner on the real server (`npm run dev` / `npm start` both go through tsx) is exposed to "Timed out … infinite loop" on correct code at a rate that depends on a race in the inherited `module.register` hooks. This alone justifies shipping `execArgv: []` today, before anything else.

3. **The mutation design's secrecy has two open channels it never mentions.** `workerData.code` is the hidden implementation and `workerData.tests` is the grader source, both readable by learner code (`import { workerData } from 'node:worker_threads'` → I printed the spec source into the logs *(reproduced, F5)*). And `dir/solution.mjs` sits on disk next to `spec.mjs`, readable with `readFileSync(new URL('./solution.mjs', import.meta.url))` *(reproduced, 919 bytes)*. `wrapExports` hides `fn.toString()` and leaves both of these open. Both are cheap to close: `workerData` is one shared object per thread, so `delete workerData.code` before importing learner code makes a later `import('node:worker_threads').workerData.code` return `undefined` *(reproduced, `p11`)*; and a worker **can** unlink its own just-imported module on Windows (`unlinkError: null, stillExists: false` *(reproduced)*), so the "Windows will not unlink while the worker holds a handle" comment in `index.ts` is not about imported modules. Alternatively serve `solution.mjs` from memory through a `registerHooks` `load` hook. Denying `node:worker_threads` in the import policy closes the `workerData` route too, but `delete` is the belt to that brace.

4. **`execArgv: []` does not stop `.ts` imports.** Covered above; the import allowlist (`registerHooks` resolve hook on `file:` URLs) is what stops `import('…/content/index.ts')`, and `fs` still reads the file. So "reading `content/` is cheating yourself, acceptable" is the honest position and Opus's recommendation 2.1 should not be sold as closing it.

5. **The import allowlist has two constraints Opus's sketch ignores** *(reproduced, `p7-hooks`)*: jsdom imports `node:vm` at load, so a hook that denies `vm` must be installed **after** `setupDom()` (or must allow `vm`); and a learner can call `module.registerHooks` themselves and `shortCircuit` a resolve, so `node:module` must be denied as well. Good news from the same probe: hooks cover `createRequire(...)('child_process')` (blocked), bare `'child_process'` (blocked), `content/index.ts` and `server/progress.ts` (blocked as outside-runDir `file:` URLs), and PGlite boots and queries fine with the hook installed. `process.getBuiltinModule('child_process')` bypasses it (Opus did say this).

6. **The typecheck cost is `@types/node`, not the DOM lib.** 194 → 65 by `types: []`; 65 → 59 by `lib`. If a future lesson needs Node types, `types: ['node']` costs 105 files (164 total, ~4× the time), so the per-lesson opt-in Opus suggests should be treated as expensive, and a `/// <reference types="node" />` sneaked into a learner file would re-inflate the program (the learner file is a root; block triple-slash directives in the `forbid` walk).

7. **Forged result *shapes* reach the UI and the save file.** `tests: 'nope'` from learner code is passed straight through `finish({...msg})` to `res.json` *(reproduced, F7)*, and `p.stats.sandboxMs += result.ms` (`server/index.ts:325,352`) adds a learner-supplied number to `progress.json`. Opus's "recompute `ok`" fixes the verdict; the parent also has to normalise `tests`, `logs`, `ms`, `phase`, `error` to their declared types.

8. **Opus's `looseEqual` still has the "internal slots" hole it was written to close.** Its proposal special-cases `URL` but `Headers`, `URLSearchParams`, `FormData`, `Blob`, `Response` and any class with only `#private` state fall through to `Object.keys` (both `[]`) → equal. `util.isDeepStrictEqual(new Headers({a:'1'}), new Headers({b:'2'}))` is `true` on this Node *(reproduced)*, so `toStrictEqual = isDeepStrictEqual` has the same hole. The generic rule that closes the family is in MUST-4 (iterables compare by entries; empty non-plain instances never compare equal by structure).

9. **Wrapping `it`/`test` is a fourth forgery** (F4 above). Not new in kind, but Opus's "three ways" undercounts, and the fix must lock `describe/it/test/beforeEach/afterEach` too, not just `expect`.

---

## Challenges to proposals

### `util.isDeepStrictEqual` for `toEqual`: no. For `toStrictEqual`: yes, behind a guard.

`isDeepStrictEqual` says `{a: 1, b: undefined} ≠ {a: 1}`, `0 ≠ -0`, `1n ≠ 1`, `new P() ≠ {x: 1}`, `[,1] ≠ [undefined,1]` *(all reproduced)*. Ask what a lesson author means when they write `expect(pick(user, ['id','name'])).toEqual({ id: 1, name: 'ada' })`:

- A learner who writes `{ ...base, nickname: user.nickname }` produces an extra `nickname: undefined`. `JSON.stringify`, the wire format every one of these lessons ultimately targets, prints the same string for both. Failing that answer with the message `expected {"a":1} to deeply equal {"a":1}` (the current output; `inspect` would at least show `nickname: undefined`) teaches nothing and costs XP and combo. Jest chose to ignore `undefined` properties in `toEqual` for exactly this reason and gives authors `toStrictEqual` for the cases where presence matters.
- `-0` shows up by accident all the time (`Math.round(-0.4)`, `0 * -1`, `-x` when `x` is 0). No lesson in this curriculum teaches the sign of zero. A grader that fails a correct `roundTo` implementation over `-0` is a trap, not a test.
- `1n` vs `1`: `q()`/`queryUser()` already coerce top-level bigints to numbers, but nested values, JSON columns and `sum()` results do not go through `normRow`. Keeping numeric-only bigint tolerance in `toEqual` (never string coercion, which is the `[0n] vs ['']` bug) is the Postgres-friendly choice.

Empirical check: I ran every js/ts/react/node/sql reference solution (52 lessons) through the committed worker with `deepEqual` replaced by pure `isDeepStrictEqual` (`p12-content-strict`, 90 s budgets to take load out of it): [P12_SUMMARY]. Reference solutions are the *author's* code; learner variants will hit the undefined-key and `-0` cases far more often than the reference does.

So: `toEqual` = lenient structural (precise rules in MUST-4), `toStrictEqual` = the same guards, then `isDeepStrictEqual`. Document both in `AUTHORING.md` with the three examples above. Opus's own sketch is close to this; the disagreement is only that its `strictEqual = isDeepStrictEqual` needs the internal-slots guard and its `looseEqual` needs the iterable rule.

### The 10-module split: not proportionate. Five files, one factory.

`worker.mjs` is 600 lines with six concerns; Opus proposes eleven files including a 5-line `primordials.mjs`, a 30-line `compile.mjs` and a `guard.mjs`. What the split is actually *for* is (a) testing `expect`/equality without spawning a worker and (b) a fresh harness per implementation for the mutation kind. Both are met by:

```
server/runner/
  worker.mjs        orchestration: port handshake, scrub workerData, env, lock globals, import, run, stream  (~150)
  expect.mjs        primordials (top of file), show(), looseEqual/strictEqual/subsetEqual, matchers, AssertionError  (~300)
  harness.mjs       createHarness({ perTestTimeoutMs, onTest }) → { api, run, addRootHook }, createLogSink()  (~150)
  envs/dom.mjs, envs/postgres.mjs, envs/typecheck.mjs   one file per heavy lazy import  (~80–120 each)
```

`compile()` is 25 lines and belongs in `worker.mjs`; the process lock and import policy are 30 lines and belong at the top of `worker.mjs` where the order relative to env setup is visible (it matters: after jsdom, before learner import). Smoke imports `expect.mjs` and `harness.mjs` directly for the equality table and registration cases, which is the testability Opus wants, without the ceremony.

### One worker per mutant: over-engineered as the default. Sequential in one worker, respawn on timeout.

Opus's sole argument for N+1 workers is the synchronous infinite loop in a mutant. That case is handled by the timeout the parent already has: run implementations sequentially in one worker with a fresh `createHarness()` and a fresh spec module per implementation (`spec.mjs?impl=3` — a query string makes Node instantiate a new module), stream `{t:'impl', key, tests}` after each one, and when the worker is killed by the budget, mark the in-flight implementation `killed (timeout)` and respawn **once** for the remaining keys. The pathological case pays two boots; the normal case pays one. Under today's load a js boot is 350–830 ms and a react boot 4–9 s (`p12`), so for a react mutation lesson with 6 mutants + 2 equivalents the sequential design saves ~30–60 s of learner wait per Run, which is the difference between a feedback loop and a coffee break. Pre-warming does not change this arithmetic; it hides one boot, not eight.

The isolation argument is weaker than it looks in both designs: a learner test can signal across runs through `os.tmpdir()` or any writable path regardless of worker boundaries, so per-worker isolation does not stop "fail on every run after the first". What stops the cheap strategies is (a) `requireAssertions`, (b) random implementation order with the correct implementation at a random position and opaque keys, (c) equivalents, and (d) the learner not knowing which run is which (quiet logs, `wrapExports`, plus the two leak closures from "What Opus missed" 3). Those are needed in both designs, so they are not a point for N+1 workers.

### "Results on a private channel": worth 10 lines, not a trust boundary.

The port closes exactly one thing, cheaply: the 1-line `parentPort.postMessage` forge and, as a side effect, the `postMessage(null)` crash (the parent stops listening on `parentPort` at all). It does not stop a learner who patches what the harness *calls*: `Array.prototype.push`, `Promise.prototype.then` on a non-native thenable, `Date.now`, `Object.keys`, `String.prototype.split`, `Function.prototype.call`. Locked globals plus primordials narrow that further, but the harness runs in the learner's realm and "airtight" is not on the menu (Opus says so too). The actual trust boundary is therefore **the parent process**: the worker is an untrusted producer of *data*, and the parent validates every field, derives `ok` from `tests`, ignores anything not on its port, and cannot be crashed by it. Given that, the private port is still worth doing because it is the difference between "a learner needs to know which prototype method the run loop uses" and "a learner needs one line", and because a `parentPort` that the parent does not listen to is a channel that cannot crash it. Do it, but describe it in the code as what it is.

Is there a real boundary available? Only two: a child process with `--permission` (Opus's option 4) — which still cannot stop in-realm forgery, because the tests still run next to the learner code — or running the spec in a different realm from the learner module (`vm.SourceTextModule` behind `--experimental-vm-modules`, or a second worker holding the tests and calling the learner's exports through a proxy). Neither is proportionate for a single-player local app. Recommendation: parent-as-boundary now; revisit only if progress ever becomes shared.

### Pre-warmed workers, persistent PGlite: agree with the ordering, with one correction

Agree: `types`/`lib` first, lazy `typescript` in SQL runs, then a persistent typecheck worker (no learner code executes there; verified by reading — `typecheckLesson()` never imports the emitted files). Correction: do not ship pre-warmed sql/react workers until the tsx-hook hang is gone, because a pre-warmed worker that has already hung is a guaranteed timeout on the next Run.

---

## FINAL RECOMMENDED CHANGES

Ordered. Each item names the exact semantics a builder should implement. "Parent" = `server/runner/index.ts`; "worker" = `server/runner/worker.mjs` and its modules.

### MUST

**MUST-1. The parent treats the worker as untrusted data and cannot be crashed by it.**
- `new Worker(WORKER, { execArgv: [], workerData: { kind, dir, port: port2, code, tests, fixtures }, transferList: [port2], env: { NODE_ENV: 'sandbox' }, resourceLimits: { maxOldGenerationSizeMb: 512 }, stdout: true, stderr: true })` where `{ port1, port2 } = new MessageChannel()`.
- `worker.on('message', () => {})` — the public port is never read. `worker.on('messageerror', () => {})`.
- `port1.on('message', (m) => { try { handle(m) } catch { /* malformed: ignore */ } })` where `handle` first checks `m && typeof m === 'object' && typeof m.t === 'string'`, else returns.
- Verdict is **derived**, never read: `tests = accumulated test rows`, each normalised to `{ name: String(x.name).slice(0, 200), passed: x.passed === true, error: x.error == null ? undefined : String(x.error).slice(0, 4000), ms: Number.isFinite(x.ms) ? x.ms : undefined }`; `ok = !error && tests.length > 0 && tests.every(t => t.passed)`; `ms = Date.now() - started` measured by the parent (never `msg.ms`); `logs` normalised to `{ level: 'log'|'warn'|'error', text: String }` and capped again in the parent (200 entries, 64 KB) because the worker's cap is advisory.
- `worker.on('exit', code)`: if no `done` message has arrived, finish with the accumulated tests and `error: code === 0 ? 'Your code ended the sandbox (process.exit()) before the tests finished.' : \`The sandbox exited with code ${code}…\``. Any exit before `done` is a failure, whatever the code.
- `worker.on('error', err)`: same, keeping accumulated tests; map `ERR_WORKER_OUT_OF_MEMORY` to "Your code used more than 512 MB of memory."
- `process.on('uncaughtException')` is **not** the fix; the fix is the parent never throwing in a listener.

**MUST-2. Boot/ready protocol and split budgets.** Messages on the private port, worker → parent, all `{ t, ... }`:
- `{ t: 'ready', bootMs }` — sent after env setup and global locking, **before** compiling or importing learner code. Parent budget until `ready`: 60 s, message on expiry: "The grader took too long to start (this is not your code). Try again." Not a learner failure; `timedOut: false, phase: 'boot'`.
- `{ t: 'plan', names: string[] }` — sent after the spec import, listing registered test names in run order. Lets the parent list `not run` rows on timeout.
- `{ t: 'test', result: { name, passed, error?, ms } }` — one per test, immediately after it finishes (after its `afterEach` hooks).
- `{ t: 'log', entry: { level, text } }` — optional streaming; if not streamed, logs ride in `done`. Either way the parent re-caps.
- `{ t: 'done', error?, phase?, logs? }` — end of run. `phase ∈ 'compile' | 'load' | 'grader' | 'fixture' | 'tests'`.
- Parent test budget starts at `ready`: sql 25 s, react/typecheck 20 s, others 10 s (unchanged values). On expiry: in-flight test (last `plan` name without a `test` row) gets `{ passed: false, error: 'timed out after Ns', timedOut: true }`, later `plan` names get `{ passed: false, error: 'not run' }`, `ok=false`, `timedOut: true`, and the accumulated logs are kept.
- Per-test timeout inside the worker: `Promise.race([t.fn(), rejectAfter(perTestMs)])` with a **ref'd** timer, default 5,000 ms, overridable via a lesson field `testTimeoutMs`. Result error: `timed out after 5 s`. The worker moves on; only synchronous loops reach the parent's budget.
- Worker scrubs `workerData` immediately after copying it into module-scope consts: `for (const k of Object.keys(workerData)) delete workerData[k]`. The transferred port is held in a module-scope `const port`, and `post = Function.prototype.call.bind(MessagePort.prototype.postMessage)` is captured at the same time.

**MUST-3. Lock the harness and neuter the process, in this order inside the worker:** env setup (jsdom/PGlite import) → install import policy → define locked globals → `ready`.
- Locked globals (all `{ writable: false, configurable: false, enumerable: true }` via `Object.defineProperty`): `describe, it, test, beforeEach, afterEach, beforeAll, afterAll, expect, assert, fail, num`; `solution` as a non-configurable **accessor** whose getter reads a harness-private variable (so the mutation kind can swap implementations); sql: `db, userSql, execUser, queryUser, q`; react: `React, render, screen, fireEvent, waitFor, act, within, renderHook, cleanup, IS_REACT_ACT_ENVIRONMENT`. `Object.freeze(expect)`; every matcher object returned by `expect()` is created from a frozen prototype so `expect(x).toBe = …` throws in strict mode.
- Trusted core uses captured primordials only: `check()`/`bail()`, `AssertionError`, the run loop in `harness.run()`, result construction and `post()`. Capture at module evaluation in `expect.mjs`/`harness.mjs`: `ObjectIs, ObjectKeys, ObjectGetOwnPropertySymbols, ObjectGetPrototypeOf, ObjectDefineProperty, ArrayIsArray`, uncurried `ArrayPrototype{Push,Every,Some,Map,Filter,Join,FlatMap,Reverse,Slice}`, `StringPrototype{Includes,Split,Slice}`, `DateNow`, `JSONStringify`, `PromiseResolve`, `SetTimeout/ClearTimeout`, `ReflectApply`. Everything outside the core (matcher bodies, `show()`) may use ordinary methods: a learner who breaks those only breaks their own run.
- Process: for `k of ['exit','kill','abort','chdir','dlopen','reallyExit','binding','_linkedBinding','getBuiltinModule']` define `process[k]` as a non-writable, non-configurable function that throws `Error(\`process.${k}() is not available in graded code\`)`.
- Import policy via `module.registerHooks` (verified present and effective on Node 24.19), installed **after** `setupDom()` because jsdom needs `node:vm` at load: `resolve(spec, ctx, next)` calls `next`, then throws `Error('import of X is not available in graded code')` when the resolved URL is `node:` + one of `child_process, cluster, worker_threads, vm, inspector, inspector/promises, v8, repl, module`, or is a `file:` URL not under `<runDir>/` or `<projectRoot>/node_modules/`. `data:` and `node:*` otherwise pass. Denying `worker_threads` closes the `parentPort`/`workerData` route; denying `module` stops a learner registering their own hooks. `node:fs`/`node:http`/`node:net` stay (node track needs them).

**MUST-4. Equality and messages.** `toEqual(a, b)` returns true iff, in order:
1. `a === b` (so `+0 === -0`), or both are `NaN`.
2. One is `bigint` and the other `number`: both are integers (`Number.isInteger` / any bigint) and `BigInt(number) === bigint`. No string coercion anywhere.
3. Both primitives otherwise → `Object.is`. Either null / non-object → false.
4. `Object.prototype.toString` tags differ → false (kills Map vs `{}`, Array vs `{}`, RegExp vs `{}`, Date vs `{}`).
5. Cycle guard: `seen: Map<a, b>`; if `seen.get(a) === b` → true, else set.
6. By type: Date → `getTime`; RegExp → `source` and `flags`; Error → `name`, `message`, then rule 10 on own enumerable props (`code`, `status`, `cause` if own); boxed primitives → `valueOf`; ArrayBuffer/TypedArray/DataView → byte equality; URL → `href`; Map → same `size`, every key of `a` in `b` (SameValueZero), values by `toEqual`; Set → same `size` and a greedy bijection (each element of `a` consumes one unmatched element of `b`); Array → same `length`, element-wise, holes read as `undefined`.
7. Other iterables (own or inherited `Symbol.iterator`, not string/array/Map/Set): tags equal (rule 4) and `[...a]` vs `[...b]` by rule 6-array. This covers `Headers`, `URLSearchParams`, `FormData`, `NodeList`, generators' arrays.
8. Remaining objects: keys = own enumerable string and symbol keys whose value is not `undefined`; same key set; each `toEqual`. Prototypes are not compared. **Guard:** if both key sets are empty and `Object.getPrototypeOf(a)` is neither `Object.prototype` nor `null` and `a !== b` → false, with the message "cannot structurally compare two X instances that expose no enumerable data; compare a projection (e.g. `[...x]`, `x.href`, `x.toJSON()`)". This closes Blob/Response/`#private` generically.
- `toStrictEqual(a, b)`: rules 4, 7 and 8's guard first, then `util.isDeepStrictEqual(a, b)` (prototype, `undefined` keys, `-0`, sparse holes all strict).
- `toMatchObject(obj, subset)`: if `subset` is not a plain object (`Object.prototype`/`null` prototype) or array → `toEqual(obj, subset)`. Array subset: same length, element-wise `toMatchObject`. Plain subset: for every own enumerable key `k` of `subset`: if `subset[k] === undefined` then `obj[k] === undefined` (present or absent); else `k in obj` and `toMatchObject(obj[k], subset[k])`.
- `toBe`: `Object.is`, unchanged; the message must distinguish `-0`, `NaN`, `1n`, `'1'` vs `1`.
- `show(v)` = `util.inspect(v, { depth: 4, maxArrayLength: 20, maxStringLength: 200, breakLength: 80, compact: 3, sorted: true, getters: false })`, computed **lazily on failure only** (`check(pass, () => msg)`). Never inside `makeExpect`.
- `toThrow(expected)`: if `actual()` returns a thenable → bail "this function is async: use `await expect(fn()).rejects.toThrow(…)`". `expected` may be string (includes), RegExp (test), Error class (`instanceof`), Error instance (`message` equal), plain object (`toMatchObject(err, expected)`); anything else bails "toThrow() takes a string, RegExp, Error class, Error or object". `.rejects`/`.resolves` settle then delegate to the full matcher set including `.not`; each returned promise is registered with the running test and awaited by the harness after `t.fn()` settles, and a `setImmediate` tick follows so late timer assertions and rejections attribute to the test that spawned them.

**MUST-5. SQL isolation check.** In `envs/postgres.mjs`: after fixtures and the up-front learner SQL, `select pg_current_xact_id_if_assigned()` — non-null means the learner's SQL left a transaction open → `done({ phase: 'load', error: 'Your SQL starts a transaction with BEGIN but never COMMITs it.' })`. Root `beforeEach`: `begin`, then `txid = select pg_current_xact_id()::text`. Root `afterEach` (internal, never swallowed silently): read `pg_current_xact_id_if_assigned()`; on error ("current transaction is aborted") treat as intact; `rollback` (ignore errors); if not intact → fail **that** test with "This test ended the grading transaction (COMMIT/ROLLBACK); later tests would have seen its data." and mark the environment dirty so `done` carries `phase: 'grader'`. `q(sql, params)` uses `db.query` when `params` is given, else `db.exec` and returns the last result's rows (fixes multi-statement `q`). Optional: wrap `q` in a savepoint.

**MUST-6. Typecheck program.** `types: []`, `lib: ['lib.es2022.d.ts']`; include `getOptionsDiagnostics()` and `getGlobalDiagnostics()` in the error list. Verified: none of the 10 typecheck lessons uses a Node/DOM global, and the current options yield zero options/global diagnostics, so this changes no verdict today and cuts the program from 194 to 59 files. A lesson-level `ambient?: ('node' | 'dom')[]` opt-in maps to `types`/`lib`, documented as expensive (+105 files for node). Walk the learner `SourceFile` and emit failing rows for `// @ts-nocheck`, `// @ts-ignore`, `// @ts-expect-error` and `/// <reference` in the learner file, always (not gated — there is no legitimate use in a graded file); gate `as`/`any` bans behind `forbid?: ('as' | 'any')[]`.

**MUST-7. Guard rails in `smoke.ts` before any of the above ships**, table-driven with `expect: { ok, phase?, timedOut?, failing?: string[], maxMs?, resultBytesUnder? }` and these cases: F1–F4 forgeries and `postMessage(null)` (must fail, parent must survive: assert `process.listenerCount('uncaughtException') === 0` and the loop continues), `process.exit(0)` (fail in < 2 s), the equality table above (each row fails), the un-awaited `.rejects`, a hung test after 3 passes (3 rows kept, `hangs` marked timed out), a 5 MB log (result under 100 KB), learner `BEGIN` without `COMMIT`, a test that commits, `AbortSignal.timeout` (heartbeat), `dispatchEvent(new Event('x'))` in react, and a run with dynamic `import()` executed 5× under a tsx parent (0 timeouts). `verify-content.ts`: a starter that `timedOut` or has `phase === 'grader'` is a content error; a reference with `ms > 0.5 × budget` is a warning.

### SHOULD

**SHOULD-1. Harness factory and registration guards.** `createHarness()` returns `{ api, run, addRootHook(kind, fn, { internal }) }` with fresh state; `describe` throws if its callback returns a thenable ("describe callbacks must be synchronous"); `it`/hooks throw while `running` is set; author `afterEach` failures fail the test, internal hooks log and continue; add `beforeAll`/`afterAll`.

**SHOULD-2. Log sink.** One `pushLog(level, text)` used by `console.*`, `unhandledRejection`, `uncaughtException` and a `worker.stdout`/`stderr` pipe in the parent; limits 200 entries, 2 KB per entry, 64 KB total; dropped counter appended as one final entry. Format with `show()`; `console.error(err)` prints `Error: boom\n    at …` (first 3 frames).

**SHOULD-3. DOM realm.** After `setupDom`, force-define from jsdom: `Event, CustomEvent, EventTarget, KeyboardEvent, MouseEvent, FocusEvent, InputEvent, AbortController, AbortSignal`, then run one smoke proving `fetch(url, { signal })` still works with jsdom's `AbortSignal` (if not, keep Node's `AbortController` and document). Root `afterEach`: `localStorage.clear(); sessionStorage.clear(); document.title = ''; document.head.innerHTML = ''; history.replaceState(null, '', '/')`.

**SHOULD-4. Module split** as in the challenge above (five files), extracted **after** MUST-1/2 land in the parent, since they need no worker changes.

**SHOULD-5. Mutation kind.** Content model as Opus proposes (`impl`, `equivalents`, `mutants[]`, `minTests`), orchestration in `server/runner/mutation.ts`, but execution is **sequential in one worker**: `workerData.impls = [{ key, code }]` in an order randomised by the parent, keys opaque (`k0…kN`), the correct implementation at a random index; the worker for each key: fresh `createHarness()`, `solution` accessor repointed, spec imported as `spec.mjs?impl=<key>`, `quiet` logs except for the correct key; posts `{ t: 'impl', key, tests }`. Parent: `killed = any row failed || run errored`, `killed (timeout)` = the in-flight key when the budget expires, then **one** respawn with the remaining keys; keys still missing after that are `not run`. Result shape returned to the UI (existing `RunResult`, no UI special case):
```ts
tests: [
  { name: 'passes against a correct implementation', passed },
  { name: 'passes against refactor #n (not over-specified)', passed },          // one per equivalent
  { name: 'catches: <mutant.label>', passed: status !== 'survived',
    error: status === 'survived' ? 'Your tests let this bug through.' : undefined }, // one per mutant
]
// plus, alongside RunResult: mutation: { score: 'killed/total', stage: 'correct'|'equivalents'|'mutants'|'done' }
```
`requireAssertions` (a test with zero `expect` calls fails with "this test asserts nothing"), `wrapExports`, `delete workerData.*` and unlink-after-import are all required for this kind. A mutant that fails at `load` is a content bug caught by `verify`.

**SHOULD-6. Persistent typecheck worker** (lib `SourceFile` cache, `oldProgram`), since it never executes learner code. Lazy `await import('typescript')` so SQL runs stop paying for it.

### COULD

**COULD-1.** Source maps for `ts`/`react` stacks (`inlineSourceMap`, `process.setSourceMapsEnabled(true)`); drop `useDefineForClassFields: false`.
**COULD-2.** Pre-warm one spare worker for the kind of the lesson currently open — only after MUST-1's `execArgv: []` is in, for the reason given above.
**COULD-3.** Persistent PGlite with a verified reset (Opus's catalog-fingerprint version). Measure after pre-warming first.
**COULD-4.** `--no-experimental-strip-types` in `execArgv` as a second speed bump against `.ts` content imports (the import policy already covers it; this one survives a policy bug).
**COULD-5.** A child process with `--permission` if the app ever binds off loopback or shares progress. Not before.
**COULD-6.** Fix the heartbeat comment and use a 2^30 ms interval; fix `content/types.ts` (`runUserSql` → `execUser`/`queryUser`).

---

## Appendix: raw numbers

- Equality probe (`p2`): 18 rows, 14 wrong verdicts or messages. Typecheck (`p5`): see table in finding 9. Forge probe (`p1`): 7 cases, 6 forgeries or crashes, 1 information leak.
- `process.exit(0)` with 6 s budget: 6,769 ms wall, `timedOut: true`. `process.exit(1)`: 2,647 ms, correct message.
- Worker boot under load: js 350–830 ms typical, first-of-session 1.2–2.2 s; react 4–42 s (!) for content lessons in `p12`; sql 6.9–20.5 s.
- tsx-parent flake (`p14`, default `execArgv`): [P14_TABLE]
- tsx-parent with `execArgv: []` (`p14`): [P14_CLEAN_TABLE]
- Content under pure `isDeepStrictEqual` (`p12`): [P12_TABLE]

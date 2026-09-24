# Review 05 — Developer tooling, verification and repo hygiene

Reviewer: Opus · Scope: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `.gitattributes`, `scripts/*`, content authoring format · Code was not modified.

Evidence was gathered by running `tsc`, `lint-content --check`, `smoke.ts`, `curriculum-report.ts`, `debug-lesson.ts`, and three throwaway audit scripts in the session scratchpad: a parallel re-implementation of `verify`, an AST escape scanner, and a mutation sampler. **A caveat on timings:** while this review ran, the machine (8 cores, 15 GB, about 1 GB free) was also running several other agents' servers, test runs and vitest pools. That load made the wall-clock numbers noisy. It also produced two of the findings below: the sweep race (F1) and the flaky timing assertions (F5).

---

## Executive summary

`npm test` covers the main contract well: reference solutions pass, starters fail. The shell around that contract is where the problems are:

- **One real concurrency bug (F1).** `sweepRunsDir()` deletes the whole shared `.runs/` directory. It runs whenever the server starts and whenever `smoke` or `verify` finishes, so it wipes the in-flight runs of every *other* process using the checkout. I hit this twice: smoke's SQL case failed with `ENOENT … spec.mjs`, and the grader reported it as "The grader failed to load (lesson bug)". The same thing will happen to a learner who clicks Submit while an author runs `npm run verify`.
- **`npm test` edits source files (F2).** `lint:content` runs without `--check`, so it rewrites content files during a test run. Its heuristic for where a template literal closes also misreads prose that ends a line with `` `x`, ``.
- **"Starter fails" is too weak, and there are no mutants (F3, F4).** A starter that fails for the wrong reason still counts as failing: a grader crash, a compile error, or a timeout. Nothing checks that the tests would catch a *slightly wrong* solution. My mutation sample found surviving mutants; details are in F4.
- **Verification is load-sensitive (F5).** Verify uses the learner's timeout budgets, and several graders assert wall-clock times such as `toBeLessThan(100)`. Under load I saw reference solutions time out and `js-task-queue` fail with `expected 547 < 200`.
- **Integration tests are manual and destructive (F6).** `e2e` and `ui-smoke` need a server you start yourself. `e2e` **resets the real save file** because `DATA_DIR` is hardcoded. `ui-smoke` silently depends on `e2e` having run first. Neither is in `npm test`, and there is no CI.
- **Checks worth adding cheaply (F7).** Duplicate lesson ids pass `npm test` and only crash the server at startup. Quiz answers are guessable: in single-answer questions the correct option is index 0 in 28 of 47 and the **longest option in 42 of 47**. A static check can flag that.
- **Content format.** Move lesson code to real files on disk: one folder per lesson, with a typed `lesson.ts` for metadata. There are 1,852 escaped backticks in the content today, and authors write code around interpolation instead of using it. A per-lesson folder removes escaping entirely, gives the embedded code editor support, and removes merge conflicts between parallel authors. A mechanical migration can be *proven* lossless with a deep-equal of the old and new `tracks`.
- **Speed.** A content-hash cache (`--changed`) plus a bounded worker pool (`--jobs`) will cut `npm test` more than anything else. Parallel mode needs a timeout multiplier and a serial retry, or it just amplifies F5.

---

## Findings

### F1 · bug · `.runs` sweep deletes other processes' in-flight runs

**Evidence.** `server/runner/index.ts:19`:

```ts
export const sweepRunsDir = () => rm(RUNS_DIR, { recursive: true, force: true }).catch(() => {});
```

This is called at server start (`server/index.ts:437`), at the end of `smoke.ts:123`, and at the end of `verify-content.ts:86,94`. `RUNS_DIR` is shared by every process in the checkout. I observed it directly:

- `npx tsx scripts/smoke.ts` → `[sql query] ok=false … The grader failed to load (lesson bug): ENOENT: no such file or directory, open '…\.runs\c88215f6-…\spec.mjs'`. Another agent's server was starting in the same checkout at the time.
- My parallel verify → `node-streams … Your code did not compile. ENOENT … solution.mjs`.

**Why it matters.** The learner sees their code blamed ("did not compile") or the lesson blamed ("lesson bug") for a filesystem race. Running `npm run dev` and `npm run verify` side by side, the normal authoring setup, triggers it. It will also bite any future parallel verify that runs in more than one process.

**Recommendation.** Scope run directories per process and sweep only what is provably dead:

```ts
// server/runner/index.ts
const OWNER = `${process.pid}-${Date.now().toString(36)}`;
const MY_RUNS = path.join(RUNS_DIR, OWNER);

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e: any) { return e.code === 'EPERM'; } };

/** Remove our own dir, plus dirs whose owning process no longer exists. */
export async function sweepRunsDir() {
  const entries = await readdir(RUNS_DIR).catch(() => [] as string[]);
  await Promise.all(entries.map(async (name) => {
    const pid = Number(name.split('-')[0]);
    if (name === OWNER || !Number.isInteger(pid) || !alive(pid)) {
      await rm(path.join(RUNS_DIR, name), { recursive: true, force: true }).catch(() => {});
    }
  }));
}
// runExercise: const dir = path.join(MY_RUNS, randomUUID());
```

The per-run retry loop in `cleanupRunDir` is reasonable for the Windows handle-release problem and should stay. Also have the worker tag ENOENT on its own files as `phase: 'sandbox'`, not `compile` or `grader`, so an infrastructure fault is never reported to the learner as their bug or a lesson bug.

### F2 · bug · `npm test` rewrites source, and the lint scanner's close-detection is a guess

**Evidence.**

1. `package.json` `"lint:content": "node scripts/lint-content.mjs content/js/index.ts …"` has no `--check`, and `"test"` calls it. Any run of `npm test`, in CI or a pre-commit hook, silently edits content and still exits 0 (`process.exit(checkOnly && total ? 1 : 0)`).
2. `closesTemplate` (`lint-content.mjs:24`) assumes a backtick closes the literal if the rest of its line is only `,;)` and whitespace. Prose like ``…use the `Map`,`` at a line end is misread as the close. I fed it:

   ```
   brief: `Use the `Map`,
   then call `fn` and ${x} here.`,
   ```

   `--fix` produced ``Use the \`Map`,`` / ``then call `fn\` and \${x}``. The wrong backtick got escaped on each line, and the output is still broken TypeScript.
3. The third escaping trap in AUTHORING.md is not detected at all: a backslash consumed by the template (`\d`, `\'`, `\n` inside a string in solution code). I confirmed that `` `const re = /\d+/; const s = 'it\'s';` `` evaluates to `const re = /d+/; const s = 'it's';`. The regex changes meaning silently, and the string becomes a syntax error that surfaces far from its cause.
4. The file list is hardcoded in `package.json`, so a seventh track would not be linted. This was probably done because `cmd.exe` does not expand globs, which is a valid reason, but the script should discover the files itself.

The current content is clean. My AST scan found **0** consumed backslashes across all six files, so authors are paying this cost by hand: 1,852 `` \` ``, 54 `\\`, and 13 `\${`.

**Recommendation.** Split the script into `lint:content` (check, used by `test`) and `fix:content` (write). Replace the character scanner with the TypeScript parser, which is already a dependency. It knows exactly where each template starts and ends, so the only remaining job is to flag raw escapes that will be consumed:

```js
// scripts/lint-content.mjs (check mode)
import ts from 'typescript';
const BS = '\\';
const files = args.length ? args : readdirSync('content', { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => `content/${d.name}/index.ts`);
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  // 1. real syntax errors, with real line numbers
  for (const d of sf.parseDiagnostics ?? []) report(file, d.start, ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  (function visit(node) {
    if (ts.isTemplateExpression(node)) report(file, node.getStart(), 'interpolation inside content template');
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      const raw = src.slice(node.getStart() + 1, node.getEnd() - 1);
      for (let i = 0; i < raw.length; i++) if (raw[i] === BS) {
        const c = raw[i + 1];
        if (c !== BS && c !== '`' && c !== '$') report(file, node.getStart() + 1 + i, `\\${c} is consumed by the template; write \\\\${c}`);
        i++;
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
}
```

That is about 30 lines. A working version is in my scratchpad (`escapes.mjs`) and it catches all three traps. It becomes unnecessary if the content format changes (see "Content format decision").

### F3 · gap · "starter fails" accepts failures for the wrong reason

**Evidence.** `verify-content.ts:70` checks only `starter.ok`. A starter counts as correctly failing if:

- the grader itself fails to load (`phase: 'grader'`, a lesson bug),
- it does not compile, or
- it times out.

In my run, starters failed as `tests: 37, timeout: 23, compile: 2`, with `node-signed-tokens` and `node-rate-limit` failing at compile. Under this machine's load most of the timeouts were probably load-induced: `sql-joins --starter` later finished in 12.5 s with six clean test failures. So the count does not prove anything by itself. What it does show is that verify **cannot tell the difference**. A starter that hangs means the learner's first Run costs the full 10–25 s budget and returns "An infinite loop … are the usual causes", which is wrong for someone who has not written anything yet.

**Recommendation.** Record the reason and assert it:

```ts
const starterOk = (r: RunResult, lesson: Lesson) =>
  !r.ok && !r.timedOut && (r.phase === undefined /* tests ran */ ? r.tests.some((t) => !t.passed) : lesson.starterMayNotCompile === true);
// problems: 'STARTER FAILS FOR THE WRONG REASON (timeout|compile|grader)'
```

Also require that the starter **loads**: `phase` is not `compile`, `load` or `grader`. Then the learner's first Run shows N red tests, which is the best onboarding the product has, and not a stack trace or a timeout. `typecheck` lessons are the exception, because there a compile diagnostic *is* the failure. Treat `phase` as undefined and diagnostics present as "tests ran".

Also: `--track=typo` checks 0 lessons and prints "Content is sound", exiting 0. Fail when the filter matches nothing.

### F4 · gap · No check that tests reject almost-correct solutions (mutation check)

**Evidence.** Nothing measures grader strength. I ran a cheap mutation sampler over the `js`, `ts` and `node` lessons: at most 8 mutants per lesson, regex operators plus single-line deletion, 60 s budget, 3 lessons at a time.

MUTATION_RESULTS

**Why it matters.** The README's headline claim is "The graders are adversarial on purpose." A surviving mutant is a concrete, reproducible counterexample to that claim for the lesson it survives in. Mutants that fail to compile are counted as killed, which is conservative.

**Recommendation.** Add `scripts/mutate.ts` (`npm run mutate -- --track=js`). Do not put it in `npm test`: it takes minutes, and some survivors are *equivalent mutants* that need a human to judge. Run it in CI on a weekly schedule and on PRs that touch `content/` (only for changed lessons, using the F9 cache). Persist accepted equivalent mutants so they stop reappearing:

```ts
// scripts/mutate.ts — the whole idea in ~60 lines
const JS_OPS: [RegExp, string][] = [
  [/===/g, '!=='], [/!==/g, '==='], [/ < /g, ' <= '], [/ > /g, ' >= '], [/ <= /g, ' < '], [/ >= /g, ' > '],
  [/&&/g, '||'], [/\|\|/g, '&&'], [/\btrue\b/g, 'false'], [/\bawait /g, ''],
  [/\breturn ([^;\n]+);/g, 'return undefined;'], [/\+ 1\b/g, '+ 0'],
];
const SQL_OPS: [RegExp, string][] = [
  [/\bdesc\b/gi, 'asc'], [/\bleft join\b/gi, 'join'], [/>=/g, '>'], [/\bnot null\b/gi, ''],
  [/\bunique\b/gi, ''], [/\bon delete cascade\b/gi, ''], [/\bdistinct\b/gi, ''], [/\bcoalesce\(/gi, '(0*0)+('],
];
function* mutants(src: string, kind: LessonKind) {
  for (const [re, rep] of kind === 'sql' ? SQL_OPS : JS_OPS)
    for (const m of src.matchAll(re)) {
      const one = new RegExp(re.source, re.flags.replace('g', ''));
      yield { label: `L${lineAt(src, m.index!)}: ${m[0].trim()} → ${m[0].replace(one, rep).trim() || '∅'}`,
              code: src.slice(0, m.index) + m[0].replace(one, rep) + src.slice(m.index! + m[0].length) };
    }
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++)
    if (isStatement(lines[i])) yield { label: `L${i + 1}: delete`, code: lines.toSpliced(i, 1).join('\n') };
}
// For each lesson: sample ≤ N mutants spread evenly, run through runExercise with 3× budget,
// report the ones where r.ok === true, minus entries in content/.mutants-accepted.json:
//   { "js-once-memoize": ["L4: delete"] }   // equivalent: reason ...
```

For `typecheck` lessons the useful mutants are different. Replace a type annotation with `any`, drop a generic constraint (`extends X` → nothing), or widen a literal type to `string`. That kind catches missing `@ts-expect-error` coverage, which is the main way those lessons go weak.

### F5 · design · Verify uses learner timeouts and graders assert wall-clock time → flaky under load

**Evidence.**

- Serial runs with the default budgets on the loaded machine: `node-middleware` solution `timedOut` at 10 s, and `ts-infer` solution `timedOut` at 20 s.
- In the parallel run, `js-task-queue` failed on `keeps the pool busy rather than batching: expected 547 < 200`.
- Wall-clock asserts in graders: `content/js/index.ts:750` (`< 100` ms), `:952` (`< 200`), `:1328` (`< 200`), and `content/node/index.ts:2299` (`< 1500`).

**Why it matters.** CI runners and older laptops are "loaded machines". A reference solution that fails in CI erodes trust in the whole pipeline. The same assertion can fail a *learner's* correct answer on a slow laptop, and that costs them their combo. Any parallel verify makes this worse.

**Recommendation.**

1. Verify passes `timeoutMs: defaultBudget(kind) * (Number(process.env.VERIFY_TIMEOUT_SCALE) || 3)`. Separately, it **warns** when a solution run in serial mode used more than 50% of the learner budget. That is the signal that actually matters for learners.
2. Before reporting a solution failure, retry it once, serially. Report "passed on retry" as `FLAKY` (a warning, not a failure) and list those lessons at the end.
3. Add a lint rule that flags `Date.now()` / `performance.now()` used in a `toBeLessThan` inside `tests`. Graders should measure concurrency structurally (max in-flight counters, ordering of resolved promises) and not by elapsed time. Where timing is the point, use ratios with generous margins.

### F6 · gap · e2e and ui-smoke are manual, destructive, order-dependent and not in `npm test`

**Evidence.**

- `e2e.ts:38` posts `/api/reset`. `server/progress.ts:11` hardcodes `DATA_DIR = path.resolve(here, '..', 'data')`, so running `npm run test:api` wipes the user's real `data/progress.json`. The README warns about this, but a warning is not a guard.
- `ui-smoke.mjs` asserts `cleared lessons are marked`, `shows at least one earned badge` and `shows explanations for a passed quiz` (lines 119, 151, 158). These pass only if e2e has already run against the same save file, and nothing says so.
- `ui-smoke.mjs:130` `check('renders the brief table', all('.md table').length >= 0)` is a tautology.
- `ui-smoke.mjs:9` imports `esbuild`, which is not declared in `package.json`. It resolves only as a transitive dependency of vite/tsx.
- `e2e.ts` duplicates reference solutions verbatim (lines 224–294) and hardcodes XP (`50`, `60`, `55`) and quiz answer indexes. A content edit breaks e2e in ways that `verify` will not predict.
- `e2e.ts:159` says "80%", but the rule is 70% (`CHAPTER_UNLOCK_RATIO`).
- If the server is not running, both scripts die with a raw `fetch failed` stack trace and no hint to start the server.

**Recommendation.**

1. A one-line server change: `DATA_DIR = process.env.BOOTLOCAL_DATA_DIR ?? path.resolve(here, '..', 'data')`.
2. `e2e.ts` imports `tracks` and uses `lesson.solution` and `lesson.xp` in place of its copies. The test is about the game layer, not about re-proving the content.
3. A self-contained runner that starts the server on a free port with a temp save file, runs e2e and then ui-smoke against it, and always tears down:

```ts
// scripts/with-server.ts   usage: tsx scripts/with-server.ts scripts/e2e.ts scripts/ui-smoke.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const freePort = () => new Promise<number>((resolve, reject) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as any; s.close(() => resolve(port)); });
  s.on('error', reject);
});

const port = await freePort();
const dataDir = await mkdtemp(path.join(tmpdir(), 'bootlocal-e2e-'));
const env = { ...process.env, PORT: String(port), BOOTLOCAL_DATA_DIR: dataDir, BASE: `http://127.0.0.1:${port}` };

// Spawn node directly (no npx/cmd shim) so kill() reaches the real process on Windows.
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
let log = ''; server.stdout!.on('data', (d) => (log += d));

const deadline = Date.now() + 30_000;
for (;;) {
  try { if ((await fetch(`${env.BASE}/api/state`)).ok) break; } catch {}
  if (server.exitCode !== null || Date.now() > deadline) { console.error('server did not start:\n' + log); process.exit(1); }
  await new Promise((r) => setTimeout(r, 200));
}

let code = 0;
try {
  for (const script of process.argv.slice(2)) {
    const runner = script.endsWith('.ts') ? ['--import', 'tsx', script] : [script];
    code = await new Promise<number>((r) => spawn(process.execPath, runner, { env, stdio: 'inherit' }).on('exit', (c) => r(c ?? 1)));
    if (code) break;
  }
} finally {
  server.kill();
  await new Promise((r) => server.once('exit', r));
  await rm(dataDir, { recursive: true, force: true });
}
process.exitCode = code;
```

```json
"test:e2e": "tsx scripts/with-server.ts scripts/e2e.ts scripts/ui-smoke.mjs"
```

There is a small race between releasing the port in `freePort` and the server binding it. It is acceptable here. The robust fix is to let the server take `PORT=0` and print `listening on :<actual>`; today `server/index.ts:440` logs the configured `PORT`, not `server.address().port`. Keep `test:e2e` out of `npm test` locally (about 1 minute, and it needs the port), but run it in CI.

### F7 · gap · Cheap static checks that `npm test` is missing

I ran these as a scratch script (`static.mts`) against the current content:

| Check | Current result | Worth gating? |
| --- | --- | --- |
| Duplicate lesson ids across tracks | none today. **But** `verify` imports `content/index.ts`, not `server/content.ts`, so a duplicate passes all of `npm test` and only throws when the server starts | **Yes** |
| Id prefix matches the track (`js-*` in `js`), `[a-z0-9-]` only | clean | Yes (ids are URLs and save-file keys) |
| XP band: 50–100 normal, 180–260 boss; boss is the last lesson of its chapter | clean | Yes (it is the documented rule) |
| README numbers match content (72 lessons, 6,785 XP, per-kind and per-track tables); e2e/ui-smoke hardcode 72, 15, 4 and 24 | match today | Yes — generate the README table between `<!-- curriculum:start/end -->` markers from `curriculum-report.ts --markdown`, and fail if it is stale |
| Quiz: duplicate indexes in `answer`, non-integer indexes, every option correct, fewer than 3 options | clean | Yes |
| **Quiz answer position/length bias** | single-answer questions: correct index `0` in **28/47**, `1` in 16, `2` in 2, `3` in 1. The **correct option is the longest one in 42/47**. There is no shuffle in `web/` or `server/` | **Yes, as a warning.** Better still, shuffle options per learner, with a seed, on the server |
| Hints mention identifiers absent from brief/starter/solution/tests | 21 hits, **0 real problems**: every hit is a deliberately new concept (`dense_rank`, `lateral`, `clearTimeout`) | **No.** Too noisy. Skip it |
| Wall-clock asserts in tests (F5) | 4 | Warning |

These run in milliseconds. Put them in `verify`'s structural pass, or in a separate `check:content` script that runs before the slow part, so a bad id fails in 1 s rather than after 4 minutes.

### F8 · design · `smoke.ts` only asserts the happy cases

**Evidence.** `smoke.ts:119` infers expectations from label text (`c.label.includes('pass') || [...]`) and asserts only `expectedOk && !r.ok`. None of the negative cases (`js fail`, `typecheck fail`, `infinite loop is killed`, `syntax error is explained`) is asserted. A sandbox that returned `ok: true` for everything would pass smoke. `timedOut` and `phase === 'compile'` are printed but never checked.

The README calls out two deliberate sandbox behaviours, and neither has a regression case: the heartbeat that keeps `AbortSignal.timeout()` working, and per-test SQL rollback. Also untested: `process.exit()` in learner code, `.rejects`, `describe`-scoped hooks, and an unused `@ts-expect-error` failing a typecheck lesson.

**Recommendation.** Make each case declare its expectation:

```ts
type Expect = { ok: boolean; timedOut?: true; phase?: string; errorMatch?: RegExp; failedTests?: number };
const cases: (RunRequest & { label: string; expect: Expect })[] = [ /* … */
  { label: 'AbortSignal.timeout fires in the worker', kind: 'js',
    code: `export const wait = () => new Promise((r) => AbortSignal.timeout(30).addEventListener('abort', () => r('fired')));`,
    tests: `it('fires', async () => { expect(await solution.wait()).toBe('fired'); });`, expect: { ok: true } },
  { label: 'sql tests are isolated by rollback', kind: 'sql', fixtures: `create table t (id serial primary key);`, code: `select 1;`,
    tests: `it('a', async () => { await q('insert into t default values'); });
            it('b', async () => { expect(num((await q('select count(*) c from t'))[0].c)).toBe(0); });`, expect: { ok: true } },
  { label: 'process.exit is contained', kind: 'js', code: `process.exit(0)`, tests: `it('x', () => {})`, expect: { ok: false, errorMatch: /exited early|process\.exit/ } },
];
// assert every field of c.expect against r, and run the cases through the same pool as verify
```

### F9 · design · `npm test` performance: sequential verify, no cache

**Evidence.** Verify runs 62 code lessons × 2 runs (solution, then starter) one after another, and each run spawns a worker that cold-imports its toolchain: jsdom plus RTL, PGlite WASM, or the TypeScript compiler. Serial timings from my runs: `sql-joins` 11.9 s solution plus 12.5 s starter; typecheck around 9–20 s; `react-custom-hooks` 8–9 s. `tsc --noEmit` took 46 s under load. My 6-way parallel run took 680 s, **slower** than the ~4 minutes the brief quotes for serial. With 1 GB of free RAM, six workers each capped at `maxOldGenerationSizeMb: 512` pushed the machine into swapping. That is the cautionary data point: parallelism has to be bounded by memory, not just by core count.

**Recommendation — two independent levers.**

**(a) `--changed` as a content-hash cache (biggest win; works with either content format).** A lesson's verdict depends only on its own fields plus the runner. Cache on that:

```ts
// scripts/verify-content.ts
import { createHash } from 'node:crypto';
const CACHE = '.cache/verify.json';          // gitignored
const runnerHash = hashFiles(['server/runner/worker.mjs', 'server/runner/index.ts', 'package-lock.json']);
const keyOf = (l: Lesson) => createHash('sha256')
  .update(JSON.stringify([runnerHash, l.kind, l.solution, l.starter, l.tests, l.fixtures])).digest('hex');

const cache: Record<string, string> = readJson(CACHE) ?? {};
const todo = lessons.filter((l) => !changedOnly || cache[l.id] !== keyOf(l));
// ... after a clean pass for lesson l: cache[l.id] = keyOf(l); write cache at the end
```

After an edit to one lesson, `npm run verify -- --changed` takes seconds. CI keeps running the full set; optionally restore `.cache/` with `actions/cache` keyed on the runner hash. A cache keyed on content hashes is more reliable than `git diff`: it survives uncommitted edits, rebases and branch switches, and a runner change invalidates everything by construction.

**(b) `--jobs=N` with a bounded pool.** Each `runExercise` call already uses its own UUID dir and its own worker, and node lessons bind port 0, so in-process concurrency is safe once F1 is fixed:

```ts
import os from 'node:os';
const jobsArg = Number(process.argv.find((a) => a.startsWith('--jobs='))?.split('=')[1]);
const byMem = Math.floor(os.freemem() / (600 * 2 ** 20));            // ~600 MB per PGlite/jsdom worker
const jobs = jobsArg || Math.max(1, Math.min(os.availableParallelism() - 1, byMem, 4));

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>) {
  const out = new Array<R>(items.length); let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
  }));
  return out;
}

const results = await pool(todo, jobs, async (lesson) => {
  const r = await verifyOne(lesson, { timeoutScale: jobs > 1 ? 3 : 1 });
  process.stdout.write(r.problems.length ? 'F' : '.');
  return r;
});
// Serial retry pass for anything that failed on time (F5), then print problems in curriculum order.
```

Sort the queue so the slow kinds (`sql`, `typecheck`, `react`) start first; that is longest-processing-time scheduling. Run the solution and starter of one lesson in parallel as well, since they are independent. On a quiet 8-core machine, `--jobs=4` should bring verify to roughly a quarter to a third of serial time. I could not measure a clean number here because of the external load. Run it once on a quiet machine before settling the default.

A further lever belongs in the runner, outside this scope: reuse a warm worker per kind for **reference** runs only. PGlite boot and the jsdom/RTL import dominate each run. Learner runs must keep the fresh worker.

### F10 · design · Script duplication and error handling

**Evidence.**

- `check()` is written twice, identically (`e2e.ts:29`, `ui-smoke.mjs:75`). `smoke.ts` and `verify-content.ts` each have their own reporting loop, and `waitFor` lives only in ui-smoke.
- Every script ends with `process.exit(…)`. In `verify` that kills any pending `cleanupRunDir` retries, which is why `sweepRunsDir` has to exist.
- `debug-lesson.ts` always exits 0, even when the lesson fails, and `npm run lesson` with no id prints `No lesson "undefined"`.
- `ui-smoke.mjs` creates a `mkdtemp` directory and never removes it.
- `ui-smoke.mjs` and `lint-content.mjs` are `.mjs`, so `tsc` never checks them. Neither is `worker.mjs`, the most important 600 lines in the repo.

**Recommendation.**

- Add `scripts/lib/report.ts` exporting `check`, `section`, `waitFor` and `finish()`. `finish()` prints the summary and sets `process.exitCode`. Convert `ui-smoke.mjs` to `.ts`, since it runs under tsx already.
- Use `process.exitCode = n` everywhere. Where a script must hard-exit because PGlite or worker handles keep the loop alive, `await sweepRunsDir()` first, as `verify` already does.
- Add `// @ts-check` to the remaining `.mjs` files and `"allowJs": true` to `tsconfig.json`, so `worker.mjs` gets at least JSDoc-level checking.

`debug-lesson.ts` should:

- exit `r.ok ? 0 : 1`;
- print usage and the three closest ids (Levenshtein) for an unknown id;
- accept `--file <path>` to run arbitrary code against a lesson's tests, which is what you need to reproduce a learner's bug report or a surviving mutant;
- print `phase`;
- show a **diff**. The harness messages are strings today (`expected X\n  to deeply equal Y`, `worker.mjs:132`). Have `toEqual`, `toStrictEqual` and `toMatchObject` attach `{ expected, actual }` as JSON on the `TestResult`. Then `debug-lesson` can print a line diff: `util.diff` in recent Node, or a 20-line LCS. The UI can use the same fields to render a proper diff for learners, which is where it matters most.

### F11 · gap · No CI, no hooks

**Recommendation.** Add `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
  schedule: [{ cron: '0 6 * * 1' }]         # weekly: catches dependency drift + runs mutate
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest]
        node: [22, 24]
        include:
          - { os: windows-latest, node: 24 }   # the author's platform; exercises the .runs/handle-release path
    runs-on: ${{ matrix.os }}
    timeout-minutes: 30
    env: { VERIFY_TIMEOUT_SCALE: '3' }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ matrix.node }}', cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint:content              # check mode (F2)
      - run: npm run test:sandbox
      - run: npm run verify -- --jobs=3
      - run: npm run build                     # vite build is not covered by npm test today
      - run: npm run test:e2e                  # self-starting server, temp save file (F6)

  mutate:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run mutate -- --jobs=3 --max=12
```

**Pre-commit without husky.** Husky v9 is essentially `git config core.hooksPath` plus a folder. It would be acceptable as a dev dependency, but it adds nothing here:

```js
// scripts/install-hooks.mjs   ("prepare": "node scripts/install-hooks.mjs")
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
if (existsSync('.git') && !process.env.CI) execFileSync('git', ['config', 'core.hooksPath', '.githooks']);
```

```sh
#!/bin/sh
# .githooks/pre-commit — Git for Windows runs this with its bundled sh
set -e
npm run -s lint:content
if git diff --cached --name-only | grep -q '^content/'; then npm run -s verify -- --changed; fi
```

Leave `tsc` out of the hook: at 46 s it is too slow for every commit, and CI runs it anyway.

### F12 · nit · Config and hygiene

- **`package.json`.**
  - Add `"engines": { "node": ">=22" }`. Content uses `AbortSignal.any` (Node 20.3+), `@types/node` is 22, and the CI matrix is 22/24.
  - Add `"license"`: `"UNLICENSED"` if it stays private, otherwise pick one. Add `"repository"` once there is a remote.
  - Declare `esbuild` in `devDependencies` (F6), pinned to the major that vite uses.
  - Add `"test:all": "npm test && npm run build && npm run test:e2e"`.
  - `typescript` in `dependencies` is correct, because the sandbox uses it at runtime.
- **`vite.config.ts`.** The proxy target hardcodes `4517`, while the server honours `PORT`, so `PORT=5000 npm run dev` breaks the UI. Use ``target: `http://127.0.0.1:${process.env.PORT ?? 4517}` ``.
- **`tsconfig.json`.**
  - Add `"isolatedModules": true`. tsx and esbuild compile file by file, and this makes `tsc` flag the constructs that breaks.
  - Server and scripts get the `DOM` lib, so `window` typechecks in server code. A split `tsconfig.node.json` / `tsconfig.web.json` would fix that, but it is low priority.
- **`.gitignore`.**
  - `server/progress.ts:94` writes `data/progress.json.tmp`, which is not ignored and gets left behind after a crash mid-save. Replace the `data/progress.json` line with `data/*` + `!data/.gitkeep`.
  - Also add `.cache/` (F9), `.env*`, `coverage/`, `*.tsbuildinfo`, `.DS_Store` and `Thumbs.db`.
- **`.gitattributes`.** Good as is. Add `*.wasm binary`, `*.woff2 binary`, `*.ico binary`, and `package-lock.json linguist-generated=true -diff` to keep PR diffs readable.
- **`content/types.ts:60`.** The doc comment mentions `runUserSql()`; the real global is `execUser()` (AUTHORING.md is correct).

---

## Content format decision

**Recommendation: option (a) — one folder per lesson, with real code files and a small typed `lesson.ts` for metadata.** Tracks and chapters are discovered from the directory tree.

```
content/
  lesson-globals.d.ts            # declares solution, describe, it, expect, render, screen, q, queryUser …
  tsconfig.json                  # editor-only: allowJs, jsx, includes lesson-globals.d.ts
  js/
    track.ts                     # track meta (title, colour, weight, blurb)
    010-closures/
      chapter.ts                 # chapter meta (title, summary)
      010-js-closure-state/
        lesson.ts                # id, title, kind, xp, why, tags, hints  (typed)
        brief.md
        starter.js
        solution.js
        tests.js
      020-js-once-memoize/ …
  sql/
    010-modelling/
      010-sql-constraints/
        lesson.ts  brief.md  starter.sql  solution.sql  tests.js  fixtures.sql
  craft/
    010-review/
      010-craft-code-review/
        lesson.ts  brief.md      # quiz lessons keep their questions in lesson.ts
```

| | (a) folder per lesson | (b) folder per chapter, `lesson.ts` + siblings | (c) split per chapter, still template literals |
| --- | --- | --- | --- |
| Escaping | **none**: files are the literal code | none | unchanged: all three traps remain |
| Editor support | full highlighting, format-on-save, `expect` autocomplete via `lesson-globals.d.ts`, markdown preview for briefs | full | none inside the strings |
| Error line numbers | a stack line `spec.mjs:15` is `tests.js:15` | same | offset from the template's start line |
| Diffs | real code diffs, per file | same | string diffs inside a 2–3k-line file |
| Parallel authoring | new lesson = new folder, **zero shared-file edits** | every lesson edits the chapter's `lesson.ts` → conflicts | conflicts are rarer but still in one file per chapter |
| `--changed` | trivial; the cache also works | trivial | cache works |
| Verify speed | unchanged (runtime-bound) | unchanged | unchanged |
| Cost | about 350 small files; metadata sits apart from code; the loader becomes async | flat folders with `js-closure-state.starter.js` naming get noisy | smallest change, fixes the least |

Option (a) wins on every axis the brief lists, except file count. The README's argument for TypeScript ("a malformed lesson is a compile error") still holds for metadata through `lesson.ts`. A missing or misnamed code file becomes a **load-time** error with a precise path, and `npm test` hits it on its first step.

Two things to get right:

1. **Keep lesson code out of the project `tsc`.** Starters of `typecheck` lessons fail typechecking by design. Add `"exclude": ["content/**/starter.*", "content/**/solution.*", "content/**/tests.*"]` to the root `tsconfig.json`. `content/tsconfig.json` plus `lesson-globals.d.ts` then gives the editor the harness globals without gating on them.
2. **Numeric folder prefixes (`010-`, `020-`) define order**, with gaps for insertions. Two authors adding lessons to the same chapter touch no shared file. An explicit order array in `chapter.ts` would recreate the conflict hotspot.

### Loader sketch

```ts
// content/load.ts
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Lesson, LessonKind, Chapter, Track, QuizQuestion } from './types.ts';

export type LessonMeta = Omit<Lesson, 'brief' | 'starter' | 'solution' | 'tests' | 'fixtures'>;
export const defineLesson = (m: LessonMeta) => m;             // typed authoring surface for lesson.ts
export const defineChapter = (c: Omit<Chapter, 'lessons' | 'id'> & { id?: string }) => c;
export const defineTrack = (t: Omit<Track, 'chapters'>) => t;

const CODE_EXT: Record<Exclude<LessonKind, 'quiz'>, string> = { js: 'js', ts: 'ts', typecheck: 'ts', react: 'jsx', node: 'js', sql: 'sql' };
const TEST_EXT: Record<Exclude<LessonKind, 'quiz'>, string> = { js: 'js', ts: 'js', typecheck: 'ts', react: 'jsx', node: 'js', sql: 'js' };

const root = path.dirname(fileURLToPath(import.meta.url));
const subdirs = (dir: string) =>
  readdirSync(dir).filter((n) => /^\d{3}-/.test(n) && statSync(path.join(dir, n)).isDirectory()).sort();
const read = (dir: string, name: string) => {
  const p = path.join(dir, name);
  return existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : undefined;
};
const need = (dir: string, name: string) => {
  const v = read(dir, name);
  if (v === undefined) throw new Error(`content: missing ${path.relative(root, path.join(dir, name))}`);
  return v;
};
const load = async <T>(file: string): Promise<T> => (await import(pathToFileURL(file).href)).default;

async function loadLesson(dir: string): Promise<Lesson> {
  const meta = await load<LessonMeta>(path.join(dir, 'lesson.ts'));
  const folderId = path.basename(dir).replace(/^\d{3}-/, '');
  if (meta.id !== folderId) throw new Error(`content: ${dir} declares id "${meta.id}"; folder says "${folderId}"`);
  const brief = need(dir, 'brief.md');
  if (meta.kind === 'quiz') return { ...meta, brief };
  const c = CODE_EXT[meta.kind], t = TEST_EXT[meta.kind];
  return {
    ...meta, brief,
    starter: need(dir, `starter.${c}`),
    solution: need(dir, `solution.${c}`),
    tests: need(dir, `tests.${t}`),
    fixtures: read(dir, 'fixtures.sql'),
  };
}

export async function loadTracks(order: string[]): Promise<Track[]> {
  const seen = new Set<string>();
  return Promise.all(order.map(async (trackId) => {
    const tdir = path.join(root, trackId);
    const meta = await load<Omit<Track, 'chapters'>>(path.join(tdir, 'track.ts'));
    const chapters = await Promise.all(subdirs(tdir).map(async (cname) => {
      const cdir = path.join(tdir, cname);
      const cmeta = await load<Omit<Chapter, 'lessons'>>(path.join(cdir, 'chapter.ts'));
      const lessons = await Promise.all(subdirs(cdir).map((l) => loadLesson(path.join(cdir, l))));
      for (const l of lessons) {                       // duplicate ids fail here, for every consumer (F7)
        if (seen.has(l.id)) throw new Error(`content: duplicate lesson id "${l.id}"`);
        seen.add(l.id);
      }
      return { id: cmeta.id ?? `${trackId}-${cname.replace(/^\d{3}-/, '')}`, ...cmeta, lessons };
    }));
    return { ...meta, chapters };
  }));
}
```

```ts
// content/index.ts — same export, now via top-level await (package is "type": "module"; tsx supports it)
import { loadTracks } from './load.ts';
export const tracks = await loadTracks(['js', 'ts', 'react', 'node', 'sql', 'craft']);
```

```ts
// content/js/010-closures/010-js-closure-state/lesson.ts
import { defineLesson } from '../../../load.ts';
export default defineLesson({
  id: 'js-closure-state', title: 'Private state with closures', kind: 'js', xp: 50,
  why: 'Every custom hook, middleware factory, and service module you write is this pattern.',
  tags: ['closures', 'encapsulation'],
  hints: [
    'Declare `let count = start` inside the function, then return an object whose methods read and write it.',
    'If you write `return { count, increment }`, the count is a copy on the object — that is exactly what this lesson is testing against.',
  ],
});
```

Nothing in `web/` imports `content/`, so no bundler has to learn about the new layout. The cost is under 50 ms of synchronous reads at server start. Under `tsx watch` (`dev:api`), `.md`/`.js`/`.sql` edits do not trigger a reload by default. Add `--include "content/**/*"` to the `dev:api` script.

### Migration, provably lossless

1. `scripts/migrate-content.ts` imports the current `tracks` and writes the tree above: 3-digit prefixes from array order, `lesson.ts` via `JSON.stringify` of the metadata, and code fields as files.
2. The same script then imports the new loader and asserts `deepEqual(oldTracks, newTracks)`. That one assertion proves every brief, starter, solution, test, fixture, hint and quiz survived byte-for-byte, including every escape that used to be hand-maintained.
3. Run `npm test` and delete the six monolithic files. `lint-content.mjs` and the escaping section of AUTHORING.md go with them. AUTHORING.md shrinks to "make a folder, fill in five files."

---

## Proposed plan

1. **Fix the `.runs` sweep race (F1).** Use per-process dirs, sweep only dead owners, and report ENOENT as `phase: 'sandbox'`. Small change, real user-facing bug.
2. **Stop `npm test` from mutating files (F2).** Split `lint:content` (check) from `fix:content`, and have the linter discover files itself.
3. **Add the millisecond checks to verify (F3, F7).** Duplicate or misformatted ids, XP bands, boss placement, README numbers, quiz sanity and position/length-bias warnings, starter must fail *in tests* (not compile/grader/timeout), and fail on `--track` matching nothing.
4. **Make smoke assert its negative cases (F8).** Add regressions for the AbortSignal heartbeat, SQL rollback isolation and `process.exit`.
5. **Add `BOOTLOCAL_DATA_DIR` and `scripts/with-server.ts` (F6).** Point `e2e.ts` at the lessons' own solutions, fold ui-smoke's dependency on e2e into one `test:e2e`, declare `esbuild`, and fix the tautology and the stale "80%".
6. **Add the CI workflow and the `core.hooksPath` pre-commit (F11)**, plus `engines`, `license` and the `.gitignore`/`.gitattributes` additions (F12).
7. **Make verify load-robust (F5):** timeout scale, serial retry, FLAKY warnings, and a lint for wall-clock asserts. Then fix the four timing-based graders.
8. **Speed (F9):** add the `--changed` content-hash cache, then `--jobs` with memory-bounded defaults and slow-kinds-first ordering. Measure on a quiet machine before choosing the default.
9. **Migrate content to per-lesson folders** using the lossless migration script. Do it after steps 1–8 so the new layout lands with a trustworthy pipeline, and before the next batch of lessons is written.
10. **Add `scripts/mutate.ts` (F4)** with an accepted-equivalents file. Run it weekly in CI and on content PRs for changed lessons, and fix the survivors listed above.
11. **Consolidate the script helpers and improve `debug-lesson` (F10):** `--file`, exit codes, fuzzy ids, and structured expected/actual diffs, which the UI can reuse for learners.

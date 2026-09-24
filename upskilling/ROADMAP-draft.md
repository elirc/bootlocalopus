# Junior → Senior, using this codebase as the vehicle

*Draft · 2026-09-23 · Upskilling programme for bootlocalopus*

The app teaches junior→mid by grading small exercises. This programme is different
in kind. You do not solve exercises. You **own this system**: you measure it, break
it, harden it, change its architecture, and write the documents a senior engineer
writes. Every mission names real files and real defects that are in the code today.

What makes a senior engineer is not knowing more APIs. It is a set of habits:
measuring before optimising, stating trade-offs before choosing, leaving a system
easier to change than they found it, and writing so that other people can check
their reasoning. The missions are built so that those habits are the only way to
meet the acceptance criteria.

> **Ground rules**
> - One branch per mission: `mission/NN-short-slug`. Open a PR against your own
>   fork, even when nobody else will read it. The PR description is part of the
>   deliverable.
> - No acceptance criterion counts without **evidence**: a test, a measurement, a
>   log excerpt, or a document. Saying "it's faster now" does not count.
> - Numbers quoted below were measured on the author's Windows 11 machine
>   (Node 24.19) in September 2026. **Re-measure them yourself.** Mission 01 asks
>   you to do exactly that.

---

## Contents

1. [Competency model](#1-competency-model)
2. [The missions](#2-the-missions): 26 missions in six phases
3. [How to run this programme](#3-how-to-run-this-programme)
4. [Reading list, keyed to missions](#4-reading-list-keyed-to-missions)
5. [Appendix: known defects the missions are built on](#appendix-known-defects-the-missions-are-built-on)

---

## 1. Competency model

There are eight dimensions. For each one, the levels are written as **behaviours a
reviewer could point to in a PR, a document or an incident**, not as adjectives.
A level is only "held" once you show its behaviours without being prompted, on
work nobody set up for you to succeed at.

Short codes used in the mission cards: **CON, API, TST, OPS, PRF, SEC, COM, DEL**.

### CON · Correctness under concurrency and async

| Junior | Mid | Senior |
| --- | --- | --- |
| Writes `async` code that works when one request runs at a time. Treats `await` as "wait here". Fixes a race by adding a delay or a flag once someone reports it. | Spots check-then-act races inside one function (for example `alreadyPassed` read before `await runExercise` in `server/index.ts`). Adds an in-flight guard or a lock and writes a test that fires two requests at once. Cancels stale fetches in effects. | Lists the **invariants** first ("XP for a lesson is awarded at most once") and then every interleaving that could break them, across tabs, retries and restarts. Picks between a mutex, idempotency keys and a single-writer queue, and writes down why. Proves the fix with a deterministic interleaving test, not with a sleep. Checks the same class of bug in neighbouring code without being asked. |

### API · API and data design, including evolution

| Junior | Mid | Senior |
| --- | --- | --- |
| Adds endpoints and fields where the UI needs them. Duplicates types by hand across client and server (`web/src/api.ts` says "Shapes mirror server/index.ts"). | Keeps one source of truth for shared types. Validates input at the boundary. Uses status codes and a consistent error shape. Knows a `GET` should not write (`/api/state` currently rolls quests and saves). | Designs for **change**: versioning, deprecation windows, additive-only migrations and stable identifiers (lesson ids are persisted keys in `data/progress.json`). Writes the compatibility policy before the endpoint. Can say which parts of the save-file schema are a public contract and which are private. |

### TST · Testing strategy and verification

| Junior | Mid | Senior |
| --- | --- | --- |
| Writes tests that pass. Checks outputs with `console.log`. Trusts a green run. | Writes tests that fail for the right reason. Covers edge cases. Separates unit tests from end-to-end tests. Notices that `scripts/smoke.ts` never asserts that its *failure* cases fail. | Treats the **test suite as a product with a budget**: wall-clock time, flake rate and defect-detection power (mutation score). Picks the cheapest test that would have caught each real bug. Knows which risks are not tested and says so. Tests the tests: seeds a bug and confirms the suite catches it. |

### OPS · Operability and reliability

| Junior | Mid | Senior |
| --- | --- | --- |
| "It works on my machine." Reads stack traces only after a user complains. Swallows errors to make them go away (`progress.ts` `save()` logs and continues). | Adds structured logs and health checks. Handles `SIGINT`/`SIGTERM`. Knows that `rename` makes a write atomic but not durable. Makes failures loud. | Writes down the **failure modes** before shipping and the runbook entry for each one. Defines SLOs for the things users feel (grading latency p95, zero lost progress). Designs for the crash in the middle of a write. Rehearses rollback. Every change is reversible, or it is marked in the PR as one-way. |

### PRF · Performance reasoning

| Junior | Mid | Senior |
| --- | --- | --- |
| Optimises what looks slow. Reports one run. | Profiles before changing anything. Reports before and after. Knows code-splitting and memoisation. | Builds a **cost model first** (where the ~9 s of a React grading run goes: worker spawn, `import('typescript')`, jsdom, React). Reports distributions (p50/p95/max over N runs), not single numbers. Sets a budget and adds a regression guard to CI. Stops when the budget is met and writes down what they chose not to do. |

### SEC · Security and trust boundaries

| Junior | Mid | Senior |
| --- | --- | --- |
| Assumes local means safe. Trusts comments like "Learner code should not be able to read the progress file". | Validates input, escapes output, knows OWASP categories, runs `npm audit`. | **Draws the trust boundaries**, then threat-models against them (STRIDE or similar). Ranks threats by impact in *this* deployment: forged XP in a single-player app is low impact, while remote code execution over the LAN through `/api/lesson/:id/run` is critical. Closes the high-impact ones and writes down which residual risks are accepted. Re-runs the model when the deployment changes (see Mission 26). |

### COM · Code review and technical communication

| Junior | Mid | Senior |
| --- | --- | --- |
| PR description: "fixes stuff". Review comments are style nits or "LGTM". | Explains *what* and *why* in PRs. Leaves review comments that are specific and actionable. Writes READMEs. | Writes **decision documents** (ADRs, design docs, postmortems) that let a reader disagree with the reasoning and not just the conclusion. In review, sorts findings by severity, separates blocking from non-blocking, and suggests the smallest safe change. Reviews AI-generated code with the same rigour as a colleague's, and can tell which kinds of mistake each tends to make. |

### DEL · Scoping, delivery and judgement

| Junior | Mid | Senior |
| --- | --- | --- |
| Takes the ticket as written. One big PR at the end. | Breaks work into PRs. Estimates in days. Flags risk. | **Changes the ticket** when the ticket is wrong. Ships the thinnest slice that retires the biggest risk first. Puts risky changes behind flags with a rollback path. Says what was deliberately left out and why. Estimates with ranges and compares them with actuals afterwards. |

### What "senior on this stack" means in one paragraph

Given any change to this repository, a senior can predict what it will break
(concurrency, persisted data, the sandbox boundary, the bundle, the test budget).
They can show evidence that it did not, reverse it if it did, and write it up so
that the next person can make the same kind of change without them.

---

## 2. The missions

### Phase map and dependencies

```
Phase A  See the system                 01 → 02 → 03
Phase B  Correctness first              04, 05 → 06
Phase C  Reliability and security       07 → 08 → 09 → 10 ; 11 → 12
Phase D  Speed with evidence            13 → 14 ; 15
Phase E  Architecture and evolution     16 → 17 → 18 → 19 → 20
Phase F  Product depth and leadership   21 → 22 ; 23 ; 24 ; 25 → 26 (capstone)
```

Hard dependencies: 03 (CI) comes before everything after it. 16 (layered server)
comes before 17 and 20. 17 (shared contracts) comes before 21, because adding a
lesson kind should be a compile error in the web app. 13 (parallel tests) and 14
(worker pool) share measurement tooling from 09.

Effort is in **focused hours**, not calendar days. A range means the
uncertainty is real. Record your actual hours in the journal and compare them.

---

### Phase A: See the system

#### Mission 01 · Baseline and system map

- **Goal.** Produce a one-page request-lifecycle diagram for `POST /api/lesson/:id/submit`
  and a baseline file of measured numbers you will beat later.
- **Grounding.** Trace `server/index.ts` (the submit route and `applyPass`), then
  `server/runner/index.ts` (`runExercise`, `timeoutFor`, `cleanupRunDir`), then
  `server/runner/worker.mjs` (`main`, `setupDom`, `setupPostgres`, `typecheckLesson`),
  then `server/progress.ts` (`save`). Measure `npm test`, `npm run test:sandbox` and
  `npm run build`.
  Reference points from the author's machine: sandbox smoke per-case times were js
  0.28 s, ts 0.49 s, node 0.59 s, sql 5.8 s, typecheck 4.3–5.2 s, react 9.1 s; the
  infinite-loop case took the full 10 s budget; the smoke run took **88 s of wall
  time while the cases themselves summed to about 36 s**; `dist/assets/index-*.js`
  was 740,795 bytes. One trivial `js` run took 6.8 s under load, and two others hit
  the 10 s timeout.
- **Why it is senior-level.** Seniors refuse to optimise or redesign something they
  have not measured, and they write baselines down so later claims can be checked.
- **Acceptance criteria.**
  - `upskilling/baseline.md` records each metric over **at least 10 runs**
    (p50/p95/max), plus machine, Node version and command lines.
  - A diagram (ASCII is fine) shows every hop from click to save file, marking each
    place where a failure is swallowed.
  - An explanation of the 88 s versus 36 s gap, backed by evidence, not a guess.
    Candidates: tsx startup, `sweepRunsDir`, Windows file locks in `cleanupRunDir`,
    antivirus scanning new files in `.runs/`.
  - A list of at least 5 "surprises": places where the code does not do what a
    comment or the README says.
- **Effort.** 6–10 h. **Dimensions.** PRF, OPS, COM.
- **What a senior does that a mid does not.** Reports variance, not only a mean, and
  notices that a 10 s budget with a 6.8 s trivial run means **the timeouts will
  flake under load**. That finding feeds Missions 12–14.

#### Mission 02 · Make the tests tell the truth

- **Goal.** Every existing test asserts what its name claims, and the pure game
  logic has real unit tests.
- **Grounding.** In `scripts/smoke.ts`, `expectedOk` only checks that the cases
  expected to pass do pass. "typecheck fail", "infinite loop is killed" (should
  assert `timedOut`) and "syntax error is explained" (should assert
  `phase === 'compile'`) are never asserted, so they can regress silently.
  `server/gamify.ts` is described as "pure functions … so the rules stay testable",
  yet nothing tests `computeXp`, `levelFromXp`, `bumpStreak` (freeze on a one-day
  gap, earning a freeze every fifth day), `dayBefore` across a DST change, or
  `rollDailyQuests` determinism.
- **Why it is senior-level.** A suite that cannot fail is worse than no suite,
  because it gives false confidence. Seniors test the tests.
- **Acceptance criteria.**
  - Each smoke case declares its expected outcome (`ok`, `phase`, `timedOut`) and
    asserts all of them.
  - Unit tests for `gamify.ts` using `node:test` (no new dependency), including
    table-driven cases for `computeXp` and a DST-boundary test for streaks.
  - For each new test, **seed the bug it guards against** (flip a sign, drop the
    freeze branch), show it goes red, then revert. List the seeds in the PR.
  - A short ADR in the PR: `node:test` versus Vitest, with the trade-off stated.
- **Effort.** 6–8 h. **Dimensions.** TST, COM.
- **Senior versus mid.** A mid adds tests. A senior shows each test can fail, and
  picks the runner by weighing the cost of a dependency against the features it
  brings.

#### Mission 03 · CI with a self-starting server

- **Goal.** A GitHub Actions pipeline that runs typecheck, content lint, sandbox
  smoke, verify, **and** the e2e and UI checks against a server it starts and stops
  itself.
- **Grounding.** `scripts/e2e.ts` and `scripts/ui-smoke.mjs` both need a running
  server, and `e2e.ts` **calls `/api/reset` against the real save file**. That is
  only safe because `DATA_DIR` in `server/progress.ts` is fixed to `../data`.
  `ui-smoke.mjs` imports `esbuild`, which is not declared in `package.json`; it
  works only because Vite brings it in transitively. The Windows-specific cleanup
  path in `server/runner/index.ts` means CI should run on both `ubuntu-latest` and
  `windows-latest`.
- **Why it is senior-level.** Test isolation (never touch a real user's data), a
  deterministic start and stop, and dependency hygiene are what make CI trustworthy
  rather than decorative.
- **Acceptance criteria.**
  - `PROGRESS_DIR` (or similar) env var added. e2e runs against a temp directory,
    and a guard refuses to reset unless that env var is set.
  - A script starts the server on a free port, polls `/api/health` with a deadline,
    runs `test:api` and `test:ui`, and **always** kills the server, even when a test
    fails.
  - `esbuild` declared explicitly; `npm ci` used; caching configured.
  - The pipeline goes red on a seeded failure in each stage (show links).
  - CI wall time recorded as a baseline for Mission 13.
- **Effort.** 8–12 h. **Dimensions.** TST, OPS, DEL.
- **Senior versus mid.** The mid gets it green. The senior makes it impossible for
  a developer running `npm run test:api` locally to wipe their own progress.

---

### Phase B: Correctness first

#### Mission 04 · The stale-response race in the UI

- **Goal.** Fix the async race conditions in the React app and prove them with
  regression tests.
- **Grounding.** `web/src/pages/Lesson.tsx`, `LessonView`: the effect calls
  `api.lesson(id).then(setLesson, …)` with no cleanup. Clicking Next → Next quickly
  can render lesson B's content under lesson C's URL. This is the same bug the
  React track grades learners on. Related: in `CodePane`, **Reset** calls
  `setCode(lesson.pristineStarter)` without saving a draft. Check whether a reload
  brings the old draft back, since `publicLesson` in `server/content.ts` prefers
  `rec.draft`. `App.tsx` also re-fetches `/state` on every non-lesson route change
  with no cancellation.
- **Why it is senior-level.** Eating your own dog food: the codebase must meet the
  standard it teaches. The real skill is writing a *deterministic* test for a race,
  meaning controlled promise resolution, not sleeps.
- **Acceptance criteria.**
  - A test (in the `ui-smoke` style, or a component test) that resolves lesson
    responses out of order and asserts the final lesson matches the URL. It must
    fail before the fix.
  - Fix uses `AbortController` in the API layer (`web/src/api.ts` `request()`
    accepts a signal), not only an `ignore` flag. Justify the choice in the PR.
  - The Reset/draft behaviour is decided, documented, and tested.
- **Effort.** 5–8 h. **Dimensions.** CON, TST.
- **Senior versus mid.** Audits **every** `useEffect` and `.then` in `web/src/` for
  the same class of bug and lists the results, whether fixed or not.

#### Mission 05 · Double-submit awards XP twice

- **Goal.** Make "a lesson awards XP at most once" a guaranteed invariant.
- **Grounding.** `server/index.ts`, `api.post('/lesson/:id/submit')`:
  `alreadyPassed = rec.status === 'passed'` is read **before**
  `await runExercise(...)`. Two concurrent submits (two tabs, a double Ctrl+Enter,
  or a retry) both read `false`, both pass, and `applyPass` runs twice: double XP,
  double history, possibly double quest completion. `/hint` has a milder version of
  the same problem.
- **Why it is senior-level.** This is a classic check-then-act race across an
  `await`. The fix is a design choice with trade-offs: a per-lesson mutex, a
  single-writer queue for all state mutations, or idempotency keys from the client.
- **Acceptance criteria.**
  - A reproduction script that fires N=10 concurrent submits of a correct solution
    and shows XP awarded more than once before the fix.
  - The invariant is written as a test, and it holds at N=50.
  - A half-page design note that compares at least three approaches. Say which one
    also protects the `/draft` and `/hint` handlers and the future multi-user mode.
  - Confirm that `/run` counts no attempt and no combo reset under concurrency.
- **Effort.** 6–10 h. **Dimensions.** CON, API, COM.
- **Senior versus mid.** The mid wraps the handler in a lock. The senior notices
  that **all** mutations share one in-memory `cache` object in `progress.ts`, and
  proposes serialising every state mutation. Mission 20 builds on that.

#### Mission 06 · Write a postmortem for a real bug in this project's history

- **Goal.** A blameless postmortem, in production format, for one of the bugs
  recorded in `upskilling/journal/001-building-v1-what-broke.md`, plus a second one
  for the Mission 05 bug.
- **Grounding.** Good candidates: #1 `AbortSignal.timeout()` never firing in a worker
  (the fix is the `keepAlive` interval at the top of `server/runner/worker.mjs`);
  #9 `beforeEach` applying to every test in the file (now `hooksFor` and suite
  chains); #4 the linter that corrupted the files it linted
  (`scripts/lint-content.mjs`). Reproduce the bug by reverting the fix **on a
  scratch branch**. Do not merge that branch.
- **Why it is senior-level.** Postmortems are how seniors turn one incident into a
  change that prevents a whole class of incidents.
- **Acceptance criteria.**
  - Standard sections: summary, impact, timeline, detection, root cause (a
    "5 whys" or causal graph), what went well, where we got lucky, action items.
    Each action item has an owner-type and a "class of bug prevented".
  - The reproduction is committed as a **regression test** that stays.
  - At least one action item is a *detection* improvement, not only a fix.
- **Effort.** 4–6 h. **Dimensions.** COM, OPS, TST.
- **Senior versus mid.** The mid describes the bug. The senior asks why nothing
  caught it earlier, and changes the system (smoke cases, lint `--check` in CI) so
  that its neighbours get caught too.

---

### Phase C: Reliability and security

#### Mission 07 · Save-file durability and schema migrations

- **Goal.** Progress is never silently lost, and the save-file schema can evolve.
- **Grounding.** `server/progress.ts`:
  - `load()` catches **every** error, including a JSON parse failure, and returns
    `fresh()`. The next `save()` then overwrites the corrupt-but-recoverable file.
    That is total, silent data loss.
  - `save()` writes to a temp file and renames it (atomic on most filesystems) but
    never calls `fsync`, and on failure it logs and carries on. Every route has
    already called `res.json` before `await store.save()`, so the user is told
    "ok" for a write that may not happen.
  - `{ ...fresh(), ...parsed }` is a shallow merge. A save file from before a
    nested field existed ends up with that field missing, for example
    `stats.sandboxMs`, and `+=` then yields `NaN`.
  - `version: 1` is written and never read.
- **Why it is senior-level.** Durability and schema evolution are the core
  responsibilities of anyone who owns persisted user data.
- **Acceptance criteria.**
  - A corrupt file is quarantined (`progress.corrupt-<ts>.json`), the error is
    logged loudly, and the UI shows a banner. Never overwrite it.
  - A rolling backup of the last N good saves.
  - An ordered migration list keyed by `version`, with a test for each migration
    and a test that loads a v1 fixture file committed to the repo.
  - A crash-consistency test: kill the process in a loop during saves (at least 200
    iterations) and assert that every file on disk parses and is either the old or
    the new state.
  - Decide and document whether the response should wait for durability.
    Measure the cost of doing so.
- **Effort.** 10–14 h. **Dimensions.** OPS, API, TST.
- **Senior versus mid.** Can explain the difference between atomic and durable
  (rename, `fsync` of the file, `fsync` of the directory), and makes a *measured*
  call about which guarantees this app needs.

#### Mission 08 · Async error handling and one error envelope

- **Goal.** No request can hang or crash the server, and every error has one shape.
- **Grounding.** `server/index.ts` uses `async` route handlers on **Express 4**,
  which does not forward rejected promises to `next()`. If `runExercise` throws (for
  example `mkdir` fails in `server/runner/index.ts`), the rejection is unhandled.
  On modern Node that terminates the process, so one bad request takes the server
  down. Errors are currently `{ error: string }` with ad-hoc statuses. `/hint` and
  `/solution` do not check `lessonUnlocked`, while `/submit` does.
- **Why it is senior-level.** Failure paths are the design, and consistent semantics
  are what make an API usable.
- **Acceptance criteria.**
  - A test that injects a failure into `runExercise` and shows the process survives
    with a 5xx response.
  - A single error middleware and envelope (consider RFC 9457 Problem Details) with
    stable machine-readable `code`s. The client in `web/src/api.ts` understands it.
  - Unlock rules are enforced consistently. Decide which endpoints need them, and
    write that down as a table in the PR.
  - A `process.on('unhandledRejection')` policy, chosen deliberately (log and exit
    is a defensible answer).
- **Effort.** 6–8 h. **Dimensions.** OPS, API.
- **Senior versus mid.** Treats "which errors are 4xx versus 5xx" as an API
  contract, and connects it to Mission 24 (Express 5 changes this behaviour).

#### Mission 09 · Observability: structured logs, latency histograms, a runbook

- **Goal.** You can answer "why was grading slow at 14:02?" from the data alone.
- **Grounding.** Today there is `console.log` at startup, `console.error` in
  `save()`, and `p.stats.sandboxMs`, a sum that hides the distribution. There are
  no request ids, no per-kind timings, and no split between worker spawn, compile,
  environment setup and test time. `worker.mjs` already posts `progress` messages,
  which can be extended into phase timings.
- **Why it is senior-level.** Operability is designed in, not bolted on. Seniors
  pick the few signals that matter: the four golden signals, adapted.
- **Acceptance criteria.**
  - JSON-lines logs with a request id carried into the runner. Phase timings from
    the worker: spawn, `import typescript`, compile, env setup, tests, teardown.
  - `GET /api/metrics` (or a dev-only page) with a p50/p95/max histogram per lesson
    kind and outcome counts (pass, fail, timeout, crash).
  - Two SLOs written down with their rationale, for example "p95 grading latency
    below 3 s for js/ts/node" and "0 lost saves".
  - `upskilling/RUNBOOK.md` covering at least: "grading times out", "save failed",
    "port in use", "`.runs/` fills the disk".
- **Effort.** 8–12 h. **Dimensions.** OPS, PRF, COM.
- **Senior versus mid.** Instruments the *phases*, so Mission 14 can prove where
  the time goes rather than guess.

#### Mission 10 · Graceful shutdown and lifecycle

- **Goal.** Ctrl+C never loses a save, never orphans a worker, and never leaves
  `.runs/` debris.
- **Grounding.** `server/index.ts` calls `app.listen` with no signal handling. The
  `writing` promise chain in `progress.ts` may be mid-write. Workers from
  `runExercise` may be running. `sweepRunsDir()` runs at startup to clean up after
  the *previous* crash. The author also found `.runs/` debris left after a script
  had called `sweepRunsDir()`, because `cleanupRunDir` is fire-and-forget and races
  the sweep. The Node track teaches graceful shutdown, so the app should do it too.
- **Why it is senior-level.** Lifecycle correctness is where "works" meets "runs in
  production".
- **Acceptance criteria.**
  - SIGINT/SIGTERM: stop accepting connections, let in-flight grading finish within
    a deadline (then terminate it), flush `save()`, close the server, and exit with
    the right code.
  - A test that sends SIGINT mid-submit and asserts the save file holds the
    completed state or the prior state, never a partial one, and that no worker
    outlives the process.
  - Runner cleanup can be awaited on shutdown. The debris race is fixed and tested.
- **Effort.** 5–8 h. **Dimensions.** OPS, CON.
- **Senior versus mid.** Handles the second Ctrl+C (force exit) and documents the
  Windows differences in signal delivery.

#### Mission 11 · Threat-model the sandbox and close two holes

- **Goal.** A written threat model of the whole app, and the two highest-impact
  holes closed.
- **Grounding.** The author confirmed the first three of these with probes against
  `runExercise`:
  1. **Result forgery.** Learner code can
     `import { parentPort } from 'node:worker_threads'` and post
     `{ ok: true, tests: [...] }`. `runExercise` accepts the first
     non-progress message as the verdict.
  2. **Harness tampering.** The learner module is imported before the spec, in the
     same realm, so `globalThis.expect = …` makes every assertion pass. So would
     patching `Array.prototype.every`, which `main()` uses to compute `ok`.
  3. **No filesystem or process isolation.** The comment in `server/runner/index.ts`
     ("Learner code should not be able to read the progress file") is false.
     `env: { NODE_ENV: 'sandbox' }` only replaces `process.env`. Worker code can
     read and write `data/progress.json` and use `child_process`.
  4. **Network exposure.** `app.listen(PORT)` binds **all interfaces**, so anyone
     on the LAN can `POST /api/lesson/:id/run` with arbitrary code: remote code
     execution. There is also no `Host` or `Origin` check, which leaves DNS
     rebinding open from any website the learner visits.
  5. **Future XSS.** `web/src/components/bits.tsx` renders `marked` output through
     `dangerouslySetInnerHTML`. That is safe only while all content is
     first-party. Mission 18 may change that.
- **Why it is senior-level.** Ranking by impact *in this deployment* is the skill.
  In a single-player app, forged XP means the learner cheats themselves: low
  impact. LAN RCE is critical. A mid fixes the most interesting hole. A senior
  fixes the most dangerous one.
- **Acceptance criteria.**
  - `upskilling/THREAT-MODEL.md`: assets, actors, trust-boundary diagram, a STRIDE
    table, and a likelihood × impact ranking.
  - **Close hole 4**: bind to `127.0.0.1` by default (LAN access only via an
    explicit flag that warns), plus a `Host`/`Origin` allowlist. Add tests.
  - **Close one more**, with a documented rationale for the choice. Options: run
    graders in a **child process** under Node's permission model (`--permission`,
    narrow `--allow-fs-read`, no child processes; permissions are process-wide, so
    this cannot be done per worker). Or have the parent accept results only over a
    private `MessageChannel` captured before learner code loads, and compute `ok`
    in the parent from per-test events.
  - Every probe above becomes a regression test in `scripts/smoke.ts` that asserts
    the attack **fails** (or is documented as an accepted risk).
  - A "residual risk" section. Be honest that in-realm grading cannot be made
    tamper-proof, and say what would change that (Mission 26).
- **Effort.** 12–20 h. **Dimensions.** SEC, COM, CON.
- **Senior versus mid.** Writes down the risks they are *accepting* and the trigger
  for revisiting each one.

#### Mission 12 · Admission control and a load test

- **Goal.** The server degrades gracefully under concurrent grading instead of
  thrashing into timeouts.
- **Grounding.** There is no limit on concurrent workers in
  `server/runner/index.ts`. Each worker gets `maxOldGenerationSizeMb: 512`, and
  React and SQL runs take 6–9 s cold. The per-kind budgets in `timeoutFor` are
  wall-clock, so under contention *correct* code times out: the author saw 10 s
  timeouts on a trivial `js` case. Logs are capped at 200 entries in `worker.mjs`,
  but not by byte size, so a `console.log` of a 50 MB string crosses the
  `postMessage` boundary unchecked.
- **Why it is senior-level.** It needs queueing theory in practice: Little's Law,
  bounded queues and backpressure, which is the opposite of "add more workers".
- **Acceptance criteria.**
  - A load test (autocannon or a small script) with a mix of lesson kinds, run at
    increasing concurrency. Plot or tabulate throughput, p95 and timeout rate
    before and after.
  - A bounded semaphore sized from measurement (not a guessed `os.cpus().length`).
    When it is full, return `429` with `Retry-After`, or queue with a visible
    position. The UI shows it.
  - Timeouts measure **CPU time or time since the run started executing**, not time
    spent queued.
  - A byte cap on logs and the result payload, with a truncation marker.
- **Effort.** 10–14 h. **Dimensions.** PRF, CON, OPS.
- **Senior versus mid.** Chooses the limit from a measured knee in the curve, and
  explains why queueing beats rejecting for a single-user app (or the reverse).

---

### Phase D: Speed with evidence

#### Mission 13 · Make `npm test` parallel and 3× faster, with a flake budget

- **Goal.** Cut `npm test` wall time to one third, with a measured flake rate below
  an agreed budget.
- **Grounding.** `scripts/verify-content.ts` runs 72 lessons, each reference **plus**
  starter, **serially** with `await` in a `for` loop. `package.json` `test` chains
  typecheck, `lint:content`, `test:sandbox` and verify serially too, although the
  first two are independent. Node lessons bind port 0, so they can run in parallel.
  PGlite and jsdom memory multiplied by N is the real constraint.
- **Why it is senior-level.** Parallelising exposes hidden shared state and
  flakiness. The senior skill is to budget flakes, not ignore them.
- **Acceptance criteria.**
  - A bounded pool with a CLI flag. Output ordering stays deterministic, so the
    failure report reads the same whatever the concurrency.
  - A per-lesson timing report, with the 10 slowest lessons listed.
  - Run the full suite **20 times** at the chosen concurrency and record the flake
    rate. The budget is written down (for example "0 flakes in 20 runs, otherwise
    concurrency drops a step"), and CI enforces the concurrency setting.
  - Parallel run's peak memory measured and reported.
  - Before/after wall time on your machine and in CI (from Mission 03).
- **Effort.** 8–12 h. **Dimensions.** PRF, TST, CON.
- **Senior versus mid.** Treats every flake as a bug report about shared state.
  Quarantine is a documented, time-boxed exception, never a silent retry.

#### Mission 14 · Warm worker pool that halves p50 grading latency, with isolation intact

- **Goal.** Halve p50 grading latency per kind, and prove isolation still holds.
- **Grounding.** Each run spawns a fresh `Worker` in `server/runner/index.ts`.
  `worker.mjs` does `import ts from 'typescript'` at the top level, **even for SQL
  runs, which never compile anything**, then boots jsdom or PGlite per run.
  The harness keeps state in module scope (`registered`, `rootSuite`, `logs`) and
  on `globalThis`, so **reusing** a worker across runs would leak state between
  learners' runs.
- **Why it is senior-level.** The obvious design (reuse workers) breaks isolation.
  The senior design is probably **pre-warming**: keep a spare worker per kind that
  has already paid its import costs, hand it the run, then throw it away. Proving
  that needs the Mission 09 phase timings.
- **Acceptance criteria.**
  - A cost breakdown per kind from Mission 09 data, showing where the milliseconds
    go before any change.
  - The pool: size per kind, replenish after each run, recycle on timeout, and a
    cap on memory held by spare workers.
  - **p50 halved** for at least react, typecheck and sql over 30 runs each. Report
    p95 as well, and p95 must not regress.
  - An **isolation test suite**: a run that sets globals, patches prototypes,
    leaves timers and writes files is followed by a clean run that must see none of
    it. Keep this suite in CI.
  - A flag to turn the pool off, and the reason it should default on (or off).
- **Effort.** 14–20 h. **Dimensions.** PRF, CON, SEC, TST.
- **Senior versus mid.** Makes the lazy-import change first (moving `typescript`
  behind a dynamic import), measures how much of the target that cheap fix meets,
  and only then builds the pool.

#### Mission 15 · Profile the React app; lazy-load CodeMirror

- **Goal.** Cut the JavaScript the dashboard needs, show before/after numbers, and
  remove unnecessary renders and requests.
- **Grounding.** `dist/assets/index-*.js` is 740,795 bytes as one chunk.
  `web/src/pages/Lesson.tsx` statically imports `@uiw/react-codemirror`, both
  language packs and `oneDark`, and `web/src/App.tsx` statically imports
  `LessonView`, so the dashboard pays for the editor. The README says "it costs
  nothing worth optimising" because it is served from localhost. **Write down
  whether that is true** (parse and compile time on a slow laptop is not zero).
  `App.tsx` also refetches the whole `/api/state` payload (all tracks, all
  achievements) on every non-lesson navigation.
- **Why it is senior-level.** Optimisation with a stated budget and a user-visible
  metric, including the possible answer "not worth it", backed by numbers.
- **Acceptance criteria.**
  - A bundle breakdown (rollup visualiser or esbuild metafile) before and after.
  - `React.lazy` + `Suspense` for the lesson route, with a sensible fallback.
    Initial-route JS reduced by at least 60%.
  - Measured on the production build with CPU throttling (DevTools 4× or 6×):
    time to interactive on the dashboard, before and after, median of 5.
  - A React Profiler recording of a navigation. Identify and remove at least one
    unnecessary render or request, or show there is none worth fixing.
  - A size budget check in CI that fails the build if the initial chunk grows past
    a threshold.
- **Effort.** 6–10 h. **Dimensions.** PRF, DEL.
- **Senior versus mid.** Edits the README's claim to match the evidence, whichever
  way it falls.

---

### Phase E: Architecture and evolution

#### Mission 16 · Refactor `server/index.ts` into layers, under characterization tests

- **Goal.** Routes become thin. Domain rules live in a testable service with no
  Express or filesystem imports.
- **Grounding.** `server/index.ts` (445 lines) mixes HTTP, projections (`profile`,
  `trackTree`, `achievementBoard`), domain rules (`applyPass`, `syncQuests`) and
  persistence calls. `nextRankFor` hard-codes `[1, 3, 5, 8, 11, 14, 18, 22]`,
  duplicating the private `RANKS` thresholds in `server/gamify.ts`, so the two will
  drift. `gradeQuiz` lives in the route file.
- **Why it is senior-level.** Refactoring safely without behaviour change is a core
  senior skill. Characterization tests come first.
- **Acceptance criteria.**
  - **First PR**: characterization tests that record current responses for a
    scripted play-through (golden JSON with timestamps normalised). They pass
    against the untouched code.
  - Next PRs: extract `LessonService` / `ProgressService` (or your own names) with
    injected clock and store. Characterization tests stay green at every commit.
  - `nextRankFor` derives from `RANKS`. There is one source of truth for rank
    thresholds.
  - Every PR is small enough to review in 15 minutes. Link them in the journal.
- **Effort.** 12–18 h. **Dimensions.** API, TST, DEL.
- **Senior versus mid.** Injects the **clock**, which makes streaks, quests and the
  "Night Shift" achievement testable, and separates refactor commits from
  behaviour changes.

#### Mission 17 · API v2 with typed shared contracts

- **Goal.** One source of truth for request and response shapes, validated at
  runtime, with a versioned API and a deprecation path for v1.
- **Grounding.** `web/src/api.ts` redeclares `LessonKind`, `Profile`, `Quest`,
  `RunResult` and others by hand. `Quest` has already drifted: the server's version
  has `metric` and `kind`. The web `LessonKind` is a **separate union** from
  `content/types.ts`, so adding a kind on the server does not break the
  `Record<LessonKind, …>` maps (`KIND_LABEL`, `KIND_LANG`) in the web app.
  `GET /api/state` mutates state and writes to disk.
- **Why it is senior-level.** Contracts and evolution: designing for the second
  client and the next change, not only the current screen.
- **Acceptance criteria.**
  - `shared/contracts.ts` (for example schemas with inferred types, or hand-written
    types plus validators) imported by both halves. `tsc` fails if either side
    drifts.
  - `/api/v2/*`: `GET`s are side-effect free (quest rollover moves to a write path
    or is computed lazily), with a consistent error envelope from Mission 08.
    Pagination is designed for `history` even if the UI does not use it yet.
  - v1 kept behind a compatibility adapter, with a documented removal date and a
    test that pins v1's behaviour until then.
  - A contract test in CI: every v2 response in the e2e run validates against its
    schema.
- **Effort.** 12–16 h. **Dimensions.** API, TST, COM.
- **Senior versus mid.** Writes the **compatibility policy** (what counts as
  breaking, how long v1 lives) before writing endpoints.

#### Mission 18 · ADR: content as TypeScript versus files, then implement the chosen loader

- **Goal.** A real architecture decision with alternatives and evidence, followed
  through to implementation.
- **Grounding.** Lessons are TypeScript objects in `content/<track>/index.ts`
  (`content/node/index.ts` is 3,325 lines). Code, specs and markdown live inside
  template literals, which is why `scripts/lint-content.mjs` exists and why
  `content/AUTHORING.md` has an escaping section. The `lint:content` script in
  `package.json` hard-codes the six track files. The README explains the current
  choice: "a malformed lesson is a compile error".
- **Why it is senior-level.** An ADR must present the strongest version of the
  option you reject. Implementation must be a zero-diff migration.
- **Acceptance criteria.**
  - `upskilling/adr/0001-content-format.md` in Nygard format (context, decision,
    status, consequences). At least three options, for example: status quo; a
    directory per lesson (`lesson.md` with frontmatter, `starter.ts`, `solution.ts`,
    `spec.ts`); a hybrid with a TS manifest that imports raw files. Score them on
    authoring ergonomics, type safety, editor tooling for spec code, diff
    readability, and verification.
  - If you choose change: a migration script, plus an **equivalence test** proving
    every lesson loads byte-identical (normalised) to the old loader, run over all
    72 lessons. `npm run verify` stays green.
  - Loader validation gives the "malformed lesson is a compile error" guarantee at
    load time, with file and line in the message.
  - Security note: if content can come from files, `bits.tsx` must sanitise
    Markdown (link to Mission 11).
- **Effort.** 12–20 h. **Dimensions.** COM, API, DEL.
- **Senior versus mid.** Is willing to decide "keep the status quo, and fix the
  pain with better tooling", and can defend that choice.

#### Mission 19 · Content ids as a persisted contract

- **Goal.** Renaming, removing or reordering lessons never corrupts or silently
  orphans a learner's progress.
- **Grounding.** `p.lessons` in `data/progress.json` is keyed by lesson id.
  `server/content.ts` throws on duplicate ids but does nothing about ids that
  disappear. Renaming a lesson strands its `LessonRecord`, which inflates or
  deflates `passed.length` in achievement checks in `server/gamify.ts` ("Committed:
  clear 50 lessons"). `readiness` ignores unknown ids, and `lessonUnlocked`
  depends on the *previous* lesson's id, so inserting a lesson mid-chapter
  re-locks lessons a learner has already reached.
- **Why it is senior-level.** Seniors spot which identifiers are hidden public
  contracts (Hyrum's Law) and protect them mechanically.
- **Acceptance criteria.**
  - A `content.lock.json` of shipped ids. `npm run verify` fails if an id vanishes
    without a `renamedFrom` / `retired` entry.
  - A content-migration step at load that re-keys renamed lessons and archives
    retired ones. Tested with fixtures.
  - A decision, with tests, on what inserting a lesson mid-chapter does to a
    learner who already passed the lessons after it.
- **Effort.** 6–10 h. **Dimensions.** API, OPS, TST.
- **Senior versus mid.** Asks "what does this change do to existing users?"
  before "does it work for new ones?".

#### Mission 20 · Swap the JSON save file for PGlite: feature-flagged, zero data loss, with rollback

- **Goal.** Durable storage in embedded Postgres behind a flag, with an online
  migration and a rehearsed rollback.
- **Grounding.** `server/progress.ts` exports `load/save/reset/record/today/log`
  over a single mutable `cache`, and `server/index.ts` mutates that object directly.
  PGlite (`@electric-sql/pglite`) is already a dependency, used by the sandbox in
  `worker.mjs`. The README's reason for JSON ("survives being copied to a USB
  stick", no setup) is a **requirement** your design must keep: PGlite can persist
  to a directory.
- **Why it is senior-level.** This is a classic storage migration: an interface
  seam, a schema, dual-running, verification, cutover and rollback, all while
  keeping a stated product constraint.
- **Acceptance criteria.**
  - A `ProgressStore` interface (built on Mission 16), with `JsonStore` and
    `PgliteStore` implementations sharing one contract-test suite.
  - A normalised schema (`lesson_records`, `history`, `days`, …) with constraints
    that encode invariants (for example `unique(lesson_id)` and a check on
    `xp_awarded >= 0`). Consider storing `history` as the event log it already is.
  - `STORE=json|pglite|dual`. In `dual` mode, write to both and read from JSON, and
    log any divergence.
  - Migration imports an existing `progress.json` (use your Mission 07 fixtures)
    and verifies the result with a deep-equal round-trip. It is idempotent.
  - Rollback: exporting PGlite → JSON restores full fidelity. Rehearse it and
    record the transcript.
  - Measure the latency impact on submit and `/state`.
  - Awarding XP becomes a **single transaction**, which also answers Mission 05 at
    the storage level.
- **Effort.** 20–30 h. **Dimensions.** API, OPS, DEL, CON.
- **Senior versus mid.** Leaves the flag defaulted to `json` until `dual` mode
  has run clean for a defined period, and writes down the exit criteria for that
  period.

---

### Phase F: Product depth and leadership

#### Mission 21 · A `mutation` lesson kind: learners write the tests

- **Goal.** A new lesson kind where the learner writes a test suite. It must pass
  against the reference implementation and fail against every mutant.
- **Grounding.** Adding a kind touches: `LessonKind` in `content/types.ts` (plus new
  fields such as `impl` and `mutants: string[]`); `main()` in
  `server/runner/worker.mjs`, which should run the learner's spec against each
  implementation in a **fresh** context; `timeoutFor` in `server/runner/index.ts`;
  structural and pass/fail rules in `scripts/verify-content.ts` (the reference
  tests kill all mutants, the starter kills none); `KIND_LABEL` and `KIND_LANG` in
  `web/src/api.ts` (compile-enforced if Mission 17 is done); the quest pool in
  `server/gamify.ts`; and `content/AUTHORING.md`.
- **Why it is senior-level.** This is a cross-cutting feature through every layer,
  and it needs a definition of "good tests" that can be graded.
- **Acceptance criteria.**
  - The kind works end to end, with at least 3 lessons (for example: a rate
    limiter, keyset pagination SQL wrapped in JS, a `useDebounce` hook). Each has
    5 or more meaningful mutants: off-by-one, a boundary flip, a dropped await, a
    swallowed error.
  - Feedback tells the learner **which behaviour** a surviving mutant changed,
    without giving away the mutant's code.
  - A trivially passing suite (no assertions) is rejected. So is a suite that
    asserts on implementation details the brief does not specify.
  - Runtime per lesson fits within the budget from Mission 12.
- **Effort.** 16–24 h. **Dimensions.** TST, API, DEL.
- **Senior versus mid.** Designs the mutants from **real bug classes** (link them
  to the postmortems in Mission 06), not random operator swaps.

#### Mission 22 · Measure grader strength across the whole curriculum

- **Goal.** Find the weakest graders among the 72 lessons, using mutation testing
  of the reference solutions.
- **Grounding.** `npm run verify` proves the reference passes and the starter
  fails. It does **not** prove the tests catch plausible wrong answers. Reuse the
  Mission 21 machinery: generate mutants of each `solution` (operator swaps,
  removed `await`, boundary changes, removed `finally`) and run them against
  `tests`.
- **Why it is senior-level.** It improves a quality signal across a whole corpus,
  and it prioritises by impact rather than fixing everything.
- **Acceptance criteria.**
  - `npm run grader-strength` writes a per-lesson mutation score and a list of
    surviving mutants.
  - Triage the bottom 10: for each, say whether the surviving mutant is
    *equivalent* (not a real bug) or a real grading gap.
  - Fix the three worst real gaps by strengthening `tests`, with verify still green.
  - A threshold added to CI for new lessons only (a ratchet, not a big-bang
    requirement).
- **Effort.** 10–16 h. **Dimensions.** TST, DEL, PRF.
- **Senior versus mid.** Uses a **ratchet** so the standard rises without blocking
  all work, and recognises equivalent mutants instead of chasing 100%.

#### Mission 23 · Game-economy simulation: tune XP so 100% completion lands at the top rank

- **Goal.** A simulation of player behaviours that tunes the economy to stated
  design goals, and a changelog that protects existing players.
- **Grounding.** From `server/gamify.ts` and the content: base lesson XP totals
  **6,785**, achievements total **5,085**, and reaching **Senior-Track (level 22)**
  needs **12,600** cumulative XP (`xpForNextLevel = 100 + 50(n−1)`). So a player
  who completes 100% with no first-try bonus, no combo and no quests lands at
  **level 21, Mid III**. A maximally efficient player (×1.5 from first-try plus
  combo) reaches **level 24**, and daily quests push further. There is also a
  naming contradiction: the app promises junior→mid, the 100% achievement is
  "Mid-Level", and the top rank is "Senior-Track".
- **Why it is senior-level.** Turning a product goal into a quantitative model,
  choosing the parameters, and handling migration for players already mid-way.
- **Acceptance criteria.**
  - A Monte Carlo sim (at least 1,000 players per persona) using the **real**
    `computeXp`, `levelFromXp`, quest pool and achievements. Personas: careful
    (few hints), guesser (many attempts), hint-heavy, and daily-habit (quests,
    streaks).
  - Design goals written **before** tuning. Example: "every persona that completes
    100% reaches the top rank; nobody reaches it before 85% completion; hints never
    make completion impossible to reward".
  - A parameter change (curve, rank thresholds, or bonuses) that meets the goals,
    with charts or tables of level against completion per persona.
  - A migration story for existing saves, since changing the curve changes
    everyone's level. Decide whether earned levels are grandfathered.
  - A product decision on the rank naming, written as a short note.
- **Effort.** 10–14 h. **Dimensions.** PRF, DEL, COM.
- **Senior versus mid.** Writes the goals first, then tunes. A mid tunes until the
  numbers look nice.

#### Mission 24 · Dependency upgrade plan: Express 5, React 19, current PGlite and TypeScript

- **Goal.** A risk-ranked upgrade plan and staged execution, where each step can be
  reverted on its own.
- **Grounding.** `package.json` pins Express 4, React 18.3, PGlite 0.2.x and
  TypeScript 5.6. Express 5 forwards rejected promises from async handlers, which
  changes the Mission 08 behaviour; path matching changes too, so check the
  `app.get('*')` fallback in `server/index.ts`. PGlite and TypeScript upgrades
  change **grading behaviour** for learners: tsc diagnostics text and codes, and
  Postgres versions. React 19 changes `act` and Testing Library interplay in the
  sandbox's `setupDom`.
- **Why it is senior-level.** For every dependency, the question is what
  observable behaviour changes for *our users*. Here that includes learners'
  grades.
- **Acceptance criteria.**
  - A table of each upgrade: breaking changes read from the official migration
    guides, blast radius in this repo (file references), how to verify it, and how
    to roll it back.
  - One PR per upgrade, ordered by risk. `npm run verify` is the regression oracle
    for grading behaviour; diff the full verify output before and after.
  - A policy for future upgrades (cadence, and who or what checks for them, such as
    Renovate or Dependabot).
- **Effort.** 10–16 h. **Dimensions.** DEL, OPS, TST.
- **Senior versus mid.** Treats "the grader's error messages changed" as a
  user-facing change that needs a note, even when every test passes.

#### Mission 25 · Review a change you did not write

- **Goal.** Build real reviewing skill: find the defects, sort them by severity, and
  communicate so that the author learns.
- **Setup.** Ask an AI coding agent to implement a feature in a throwaway branch,
  without your guidance. Examples: "export progress as CSV from the Stats page",
  "add a `/api/lesson/:id/reset` endpoint", "add keyboard navigation between
  lessons". Separately, ask a colleague (or a second AI session) to plant three
  subtle bugs in a copy of one of your own merged mission PRs.
- **Grounding.** The riskiest places for such changes are known from earlier
  missions: shared mutable `cache` (05), save durability (07), async errors (08),
  unlock rules (08), `GET` side effects (17), and the sandbox boundary (11).
- **Why it is senior-level.** Reviewing is where seniors multiply their impact, and
  reviewing AI-generated code is now a core skill.
- **Acceptance criteria.**
  - A review written in the tone you would use for a new colleague. Use severity
    labels (blocking, should-fix, nit, question) or Conventional Comments.
  - For the planted-bug PR: how many of the 3 you found, how long it took, and
    which checklist item would have caught each one you missed.
  - A personal `upskilling/REVIEW-CHECKLIST.md` specific to this codebase, at most
    one page, updated from what you missed.
  - One paragraph comparing the failure patterns you saw in AI-written code with
    those in human-written code.
- **Effort.** 6–10 h. **Dimensions.** COM, SEC, CON.
- **Senior versus mid.** Leaves fewer, higher-value comments, and proposes the
  **smallest safe change** that unblocks the author.

#### Mission 26 · Capstone: classroom mode (a multi-user design plus a thin slice)

- **Goal.** Turn a single-player local app into a multi-learner server for a
  bootcamp cohort. Write the design doc, get it reviewed, and ship a vertical slice
  behind a flag. Then **teach back**.
- **Grounding.** Every earlier mission changes meaning here:
  - Forged XP (Mission 11) stops being "cheating yourself" and becomes cheating a
    leaderboard.
  - The sandbox becomes a boundary **between users**, so in-realm grading is no
    longer acceptable.
  - The in-memory `cache` in `progress.ts` must become per-user and transactional.
  - `app.listen` must be network-reachable (reversing Mission 11 on purpose, with
    auth).
  - Worker admission control (Mission 12) becomes per-user fairness.
- **Why it is senior-level.** It combines architecture, security, capacity planning,
  migration and scoping in one document. The slice tests whether you can cut scope.
- **Acceptance criteria.**
  - A design doc: goals and non-goals, a capacity estimate (for example 30 learners
    at 1 submit/min each: CPU-seconds needed per kind, from Mission 09 data), an
    updated threat model, a data model (from Mission 20), auth choice, rollout and
    rollback, and open questions.
  - The doc is reviewed by at least one human or AI reviewer who is instructed to
    attack it. Record the disagreements and how you resolved them.
  - A slice: two users, separate progress, per-user rate limits, graders in
    out-of-process isolation. Behind `MODE=classroom`, with single-player behaviour
    unchanged. Prove the last point with the Mission 16 characterization tests.
  - **Teach-back**: add a short "Senior Craft" track to `content/` with at least 4
    lessons drawn from your missions (for example a `mutation` lesson about the
    double-submit race, and a `quiz` on a threat-model ranking). All must pass
    `npm run verify`.
- **Effort.** 30–50 h. **Dimensions.** All eight.
- **Senior versus mid.** The non-goals section is as carefully argued as the goals,
  and the slice is small enough to ship in a week.

---

### Mission summary

| # | Mission | Hours | Primary dimensions |
| --- | --- | --- | --- |
| 01 | Baseline and system map | 6–10 | PRF OPS COM |
| 02 | Tests tell the truth | 6–8 | TST COM |
| 03 | CI with self-starting server | 8–12 | TST OPS DEL |
| 04 | UI stale-response race | 5–8 | CON TST |
| 05 | Double-submit XP race | 6–10 | CON API COM |
| 06 | Postmortems | 4–6 | COM OPS TST |
| 07 | Save durability and migrations | 10–14 | OPS API TST |
| 08 | Async errors and error envelope | 6–8 | OPS API |
| 09 | Observability and runbook | 8–12 | OPS PRF COM |
| 10 | Graceful shutdown | 5–8 | OPS CON |
| 11 | Threat model and two holes | 12–20 | SEC COM CON |
| 12 | Admission control and load test | 10–14 | PRF CON OPS |
| 13 | Parallel tests and flake budget | 8–12 | PRF TST CON |
| 14 | Warm worker pool | 14–20 | PRF CON SEC TST |
| 15 | Bundle and React profiling | 6–10 | PRF DEL |
| 16 | Layered refactor | 12–18 | API TST DEL |
| 17 | API v2 and shared contracts | 12–16 | API TST COM |
| 18 | Content-format ADR and loader | 12–20 | COM API DEL |
| 19 | Content ids as contract | 6–10 | API OPS TST |
| 20 | PGlite storage swap | 20–30 | API OPS DEL CON |
| 21 | `mutation` lesson kind | 16–24 | TST API DEL |
| 22 | Grader strength | 10–16 | TST DEL PRF |
| 23 | Economy simulation | 10–14 | PRF DEL COM |
| 24 | Dependency upgrades | 10–16 | DEL OPS TST |
| 25 | Reviewing others' code | 6–10 | COM SEC CON |
| 26 | Capstone: classroom mode | 30–50 | all |
| | **Total** | **≈ 270–420 h** | |

At 8 focused hours a week, that is roughly 8–12 months. That is realistic for
junior→senior *habits*. Title and scope also come from work experience that no
single repository can provide.

---

## 3. How to run this programme

### Cadence

- **Weekly rhythm (about 8 h).** Two 3-hour build sessions and one 2-hour session
  for review and writing. Do not skip the writing session: that is where most of
  the growth happens.
- **Per-mission loop.**
  1. **Plan (≤ 1 page, before code).** Restate the goal, list the risks, sketch the
     approach, list what you will *not* do, estimate hours as a range.
  2. **Baseline.** Measure or reproduce the current behaviour first. No baseline,
     no mission.
  3. **Build in small PRs.** Each PR should be reviewable in 15 minutes. Refactors
     and behaviour changes go in separate PRs.
  4. **Evidence pack.** Tests, numbers or transcripts, attached to the PR.
  5. **Self-review** with the rubric below, *then* external review.
  6. **Journal entry.** Mandatory for every mission.
  7. **Retro (15 min).** Estimate against actual hours, and what surprised you.
- **Every 6 missions: calibration checkpoint.** Re-score yourself on all eight
  dimensions, pick the two weakest, and choose missions that exercise them next.
  Reordering within a phase is fine; skipping hard dependencies is not.
- **Every quarter:** re-read your first journal entries. If you would not make the
  same decision today, write a short follow-up entry saying why. That is
  measurable growth.

### Self-review rubric (score each mission 1–4 per exercised dimension)

| Score | Meaning | Test you apply to your own PR |
| --- | --- | --- |
| 1 | Junior | It works on the happy path. Evidence is "I tried it". |
| 2 | Mid | Edge cases are tested. The PR explains what and why. Numbers are single runs. |
| 3 | Senior-emerging | Invariants are stated. The failure modes are listed and tested. Distributions are reported. Alternatives appear in writing. Rollback exists. |
| 4 | Senior | All of 3, **plus**: you changed the system so the whole *class* of problem is caught (a lint, CI gate, type, ratchet or runbook), you wrote down what you chose not to do, and someone else could extend your work from the docs alone. |

A mission is **done** when every acceptance criterion has evidence **and** it scores
≥ 3 on each dimension it exercises. Log the scores in the journal entry.

**Pre-PR checklist (paste it into every PR description):**

- [ ] What invariant does this change protect or introduce? Is it tested?
- [ ] What happens on the second concurrent call? On a crash halfway through? On restart?
- [ ] What persisted data or API shape does this touch? Is it backward compatible?
- [ ] What is the rollback? Is anything one-way?
- [ ] What did I measure, how many runs, and on what machine?
- [ ] What did I deliberately leave out?
- [ ] Which new trust boundary, input or dependency does this add?

### Getting review from an AI

AI reviewers are useful, but by default they are agreeable and generic. To get
real value:

1. **Review your own work first**, and write down what you think the problems are.
   Then compare. The gap between the two lists is what you learn.
2. **Give it the repository context and ask it to attack, not approve.** For
   example: "You are reviewing a PR to a Node/Express app whose grading sandbox runs
   untrusted code in `worker_threads`. Find the three most serious defects. For
   each: the file and line, the failing scenario step by step, and a test that
   would expose it. If you find none, say which scenario you tried hardest to
   break."
3. **Demand falsifiable claims.** Every finding must come with a reproduction or a
   test. Discard any finding you cannot reproduce, and note that you did.
4. **Use separate sessions for design review and code review.** For design docs
   (Missions 18, 20 and 26), ask for "the strongest argument for the option I
   rejected".
5. **Never paste your conclusions into the prompt.** It will agree with them.
6. **Track its precision.** Keep a tally in the journal of AI findings that were
   real versus noise. It calibrates how much to trust it, and teaches you its blind
   spots (Mission 25).

The existing reviews in `upskilling/reviews/` are a useful cross-check *after* you
have done your own analysis in Missions 01 and 11. Do not read them before.

### Getting review from a human

- **Ask for a specific kind of review.** "Please check the concurrency argument in
  `design.md` §3; skip style" gets better feedback than "thoughts?".
- **Send context first.** Include the plan, the invariant, the evidence pack, and
  the question you are least sure about.
- **Time-box it.** Offer 30 minutes, and send the material a day ahead.
- **Record the disagreement,** not just the agreement. If you did not take their
  advice, say why in the journal.
- **Good reviewers:** a senior colleague at work, a mentor community, or an
  open-source maintainer, in exchange for your review of their work. Review swaps
  with a peer on the same programme work well from Mission 16 onward.

### Journal

One file per mission, `upskilling/journal/NNN-mNN-slug.md`, continuing the
numbering of the entries already in that folder. Template:

```markdown
# NNN · Mission NN — <title>
*<date> · <hours estimated> → <hours actual> · Rubric: CON 3 · API 2 · …*

## Context
What was true before I started. The baseline numbers. The constraint that mattered most.

## Decision
What I did, in one paragraph a stranger could check.

## Alternatives
At least two options I did not take, and the specific reason for each.
Include the strongest argument for the one I rejected.

## Evidence
Links to tests, measurements (with N and machine), transcripts, and PRs.
What would convince me I was wrong?

## What I'd do differently
One process change and one technical change. Not "be more careful".

## Review log
Who or what reviewed it, what they found, and what I accepted or rejected, with reasons.
```

Rules for the journal: write it **on the day**, not at the end of the mission. It
is fine for an entry to say "I was wrong about X", and those are the most valuable
entries.

### How to know you are done

You have finished the programme when all of the following are true:

1. **Coverage.** Every competency dimension has **at least two missions scored 4**,
   and no dimension is below 3 on its most recent mission.
2. **Independence test.** Pick a problem in this repo that no mission covers (for
   example "the streak logic across time zones when the laptop travels", or
   "export and import of progress between machines"). Deliver a design doc and a
   first PR **with no mission card**, and have it reviewed. The reviewer should not
   be able to tell it was not a planned mission.
3. **Teach-back.** Your "Senior Craft" track from Mission 26 passes
   `npm run verify`, and a peer who works through it learns something they did not
   know.
4. **Review calibration.** On Mission 25's planted-bug exercise (repeated with fresh
   bugs), you catch at least 2 of 3 bugs in under 45 minutes, and your comments need
   no rewording before sending.
5. **Artifacts a hiring manager could read.** A folder of ADRs, postmortems, a
   threat model, a runbook and a design doc, each of which stands on its own. That
   folder is your evidence packet for a senior role.

If one of these is missing, the programme is not finished, whatever the mission
count says.

---

## 4. Reading list, keyed to missions

All are well-known, published works. Read the sections relevant to a mission
*during* the mission, not all up front.

| Missions | Reading | Why |
| --- | --- | --- |
| 01, 12, 14 | Brendan Gregg, *Systems Performance* (2nd ed.), especially the USE method and methodology chapters | How to measure before you guess |
| 01, 09, 14 | Gil Tene, "How NOT to Measure Latency" (talk) | Percentiles, coordinated omission, why averages lie |
| 02, 13 | Vladimir Khorikov, *Unit Testing Principles, Practices, and Patterns* | What makes a test valuable. Mocks versus real collaborators |
| 02, 06 | David J. Agans, *Debugging: The 9 Indispensable Rules* | The method behind the eleven bugs in journal 001 |
| 03, 13 | Jez Humble & David Farley, *Continuous Delivery* | Deployment pipelines, test isolation |
| 03 | Nicole Forsgren, Jez Humble, Gene Kim, *Accelerate* | Why fast, reliable pipelines matter, with evidence |
| 04 | React docs: "Synchronizing with Effects" (fetching data and race conditions), "You Might Not Need an Effect" | The canonical form of the Mission 04 bug |
| 05 | Brandur Leach, "Implementing Stripe-like Idempotency Keys in Postgres" (brandur.org) | Idempotency as a design tool |
| 05, 20 | Martin Kleppmann, *Designing Data-Intensive Applications*, chapter 7 (Transactions) | Race conditions, isolation levels, lost updates |
| 06 | Google, *Site Reliability Engineering*, chapter "Postmortem Culture: Learning from Failure" | Blameless postmortem format |
| 06 | John Allspaw, "Blameless PostMortems and a Just Culture" (Etsy Code as Craft blog) | Why blame hides causes |
| 07 | Pillai et al., "All File Systems Are Not Created Equal" (OSDI 2014) | Why `rename` alone is not durability |
| 07 | Dan Luu, "Files are hard" (danluu.com) | A readable summary of the above |
| 08 | Express docs: "Error handling"; Express 5 migration guide | Async errors in Express 4 versus 5 |
| 08, 17 | RFC 9457, *Problem Details for HTTP APIs* | A standard error envelope |
| 09 | Google, *Site Reliability Engineering*, chapters "Monitoring Distributed Systems" (four golden signals) and "Service Level Objectives" | Which signals to pick, and SLOs |
| 09 | Charity Majors, Liz Fong-Jones, George Miranda, *Observability Engineering* | Structured events over log lines |
| 10, 12 | Michael T. Nygard, *Release It!* (2nd ed.) | Stability patterns: timeouts, bulkheads, back-pressure, shutdown |
| 11 | Adam Shostack, *Threat Modeling: Designing for Security* | STRIDE and trust boundaries |
| 11 | OWASP Cheat Sheet Series (XSS Prevention, Node.js Security) | Concrete defences |
| 11 | Node.js docs: "Permission Model"; the `node:vm` docs ("not a security mechanism"); `worker_threads` | What isolation Node does and does not provide |
| 12 | Little's Law, via Kleppmann *DDIA* ch. 1 or Mor Harchol-Balter, *Performance Modeling and Design of Computer Systems* | Queueing intuition for admission control |
| 13 | Martin Fowler, "Eradicating Non-Determinism in Tests" (martinfowler.com) | Root causes of flakiness |
| 13 | Google Testing Blog, "Flaky Tests at Google and How We Mitigate Them" (2016) | Flake budgets at scale |
| 15 | web.dev articles on code splitting and "Reduce JavaScript payloads with code splitting"; React docs for `lazy` and `<Profiler>`; Vite docs "Building for Production" | The tools for Mission 15 |
| 16 | Michael Feathers, *Working Effectively with Legacy Code* | Characterization tests, seams |
| 16 | Martin Fowler, *Refactoring* (2nd ed.) | Small, behaviour-preserving steps |
| 16, 17 | John Ousterhout, *A Philosophy of Software Design* | Deep modules, information hiding |
| 16 | Kent Beck, *Tidy First?* | Separating structure changes from behaviour changes |
| 17, 19, 24 | Titus Winters, Tom Manshreck, Hyrum Wright, *Software Engineering at Google*: chapters on Hyrum's Law, dependency management, and code review | Contracts you did not know you had |
| 17 | Google Cloud "API Design Guide"; Semantic Versioning 2.0.0 spec | Versioning and compatibility policy |
| 18 | Michael Nygard, "Documenting Architecture Decisions" (2011 blog post) | The ADR format |
| 20 | PostgreSQL docs, "Concurrency Control" (MVCC, explicit locking); PGlite docs (filesystem persistence) | Storage semantics for the migration |
| 21, 22 | Yue Jia & Mark Harman, "An Analysis and Survey of the Development of Mutation Testing" (IEEE TSE, 2011); Stryker Mutator docs | Mutation operators, equivalent mutants |
| 23 | Jesse Schell, *The Art of Game Design: A Book of Lenses*; Raph Koster, *A Theory of Fun for Game Design* | What a reward loop is for |
| 25 | Google Engineering Practices, "How to do a code review" and "The CL author's guide" (google.github.io/eng-practices); Conventional Comments (conventionalcomments.org) | Review as a skill with a standard |
| 26 | Tanya Reilly, *The Staff Engineer's Path*; Will Larson, *Staff Engineer: Leadership Beyond the Management Track* | What "beyond senior" looks like, so you know the direction |
| 26 | Kleppmann, *DDIA*, chapters 1–2 and 5 | Capacity and data-model reasoning for the design doc |
| all | Andrew Hunt & David Thomas, *The Pragmatic Programmer* (20th anniversary ed.) | The general habits, as a companion |

---

## Appendix: known defects the missions are built on

These were found while drafting the programme, by reading the code and running
probes against a scratch copy (no repository files were changed). Re-verify each one
before you rely on it. Code changes, and verifying is part of the skill.

| # | Where | Defect | Mission |
| --- | --- | --- | --- |
| 1 | `server/index.ts` submit route | `alreadyPassed` read before `await runExercise`: concurrent submits double-award XP | 05 |
| 2 | `server/progress.ts` `load()` | Any parse error → `fresh()` → next save overwrites the user's file | 07 |
| 3 | `server/progress.ts` `save()` | Errors swallowed after the response is sent; no `fsync`; shallow merge; `version` unused | 07 |
| 4 | `server/index.ts` (all async routes) | Express 4 does not catch async rejections; on modern Node an unhandled rejection exits the process | 08 |
| 5 | `server/index.ts` `/hint`, `/solution` | No `lessonUnlocked` check, unlike `/submit` | 08 |
| 6 | `server/index.ts` `GET /state` | Mutates quest state and writes to disk on a GET | 17 |
| 7 | `server/runner/worker.mjs` | Learner code can post a forged verdict via `parentPort` (**confirmed**) | 11 |
| 8 | `server/runner/worker.mjs` | Learner code can replace `globalThis.expect` before the spec loads (**confirmed**) | 11 |
| 9 | `server/runner/index.ts` | Comment claims learner code cannot read the save file; it can read the filesystem (**confirmed**) | 11 |
| 10 | `server/index.ts` `app.listen` | Binds all interfaces, with no Host/Origin check: LAN RCE, DNS-rebinding exposure | 11 |
| 11 | `server/runner/index.ts` | No concurrency cap; wall-clock timeouts include contention; cold `js` run seen at 6.8 s against a 10 s budget | 12, 14 |
| 12 | `server/runner/worker.mjs` | `typescript` imported eagerly for every kind; log entries not byte-capped | 12, 14 |
| 13 | `scripts/smoke.ts` | Failure, timeout and compile-phase cases are never asserted | 02 |
| 14 | `scripts/verify-content.ts` | 144 grading runs executed serially | 13 |
| 15 | `scripts/e2e.ts` + `server/progress.ts` | e2e resets the real save file; `DATA_DIR` not configurable | 03 |
| 16 | `scripts/ui-smoke.mjs` | Imports undeclared `esbuild` | 03 |
| 17 | `web/src/pages/Lesson.tsx` `LessonView` | Fetch effect has no cancellation: stale lesson can win | 04 |
| 18 | `web/src/api.ts` | Hand-mirrored types; `LessonKind` duplicated, `Quest` already drifted | 17, 21 |
| 19 | `web/src/pages/Lesson.tsx` + `App.tsx` | CodeMirror in the initial bundle (740,795 B single chunk) | 15 |
| 20 | `web/src/components/bits.tsx` | Unsanitised `marked` → `dangerouslySetInnerHTML` (safe only while content is first-party) | 11, 18 |
| 21 | `server/index.ts` `nextRankFor` | Duplicates rank thresholds from `gamify.ts` `RANKS` | 16 |
| 22 | `server/gamify.ts` + content | 100% completion with no bonuses reaches L21 "Mid III", not the top rank (needs 12,600; base + achievements = 11,870) | 23 |
| 23 | `server/content.ts` / progress | Lesson ids are persisted keys with no rename or retire story | 19 |
| 24 | `server/runner/index.ts` `cleanupRunDir` | Fire-and-forget cleanup races `sweepRunsDir`; `.runs/` debris observed | 10 |

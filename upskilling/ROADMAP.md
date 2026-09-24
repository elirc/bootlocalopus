# Junior → Senior, using this codebase as the vehicle

*2026-09-23 · Final programme for bootlocalopus · Supersedes `ROADMAP-draft.md`*

You built this app in one long session and then wrote down the eleven things
that broke (`journal/001`). That journal is the most senior document in the
repository, because it records reasoning that someone else could check. This
programme asks you to produce more of that, on a system you already understand,
where every defect is real and every number can be re-measured.

The app grades small exercises. This programme does not. Each mission is a piece
of ownership work on the app itself: measure it, break it, harden it, change its
architecture, and write the documents that go with each change. The missions
are written so that the habits of a senior engineer are the shortest path to
the acceptance criteria, not an add-on to them.

> **Ground rules**
> - One branch per mission: `mission/NN-short-slug`. Open a PR on your own
>   fork even when nobody else will read it. The PR description is a deliverable.
> - No acceptance criterion counts without evidence: a test, a measurement, a
>   log excerpt, or a document. "It's faster now" is not evidence.
> - Every mission starts with a written estimate (a range) and ends with the
>   actual hours. Mission 21 is where you find out how wrong you were.
> - Numbers quoted below were reported by the draft's author on a Windows 11
>   machine, Node 24.19, September 2026, under heavy load from other processes.
>   Treat them as hypotheses. Mission 01 replaces them with your own.
> - Do not read `upskilling/reviews/` until you have finished Missions 01 and 08.
>   They contain answers to questions you should work out first.

---

## Contents

1. [Competency model](#1-competency-model)
2. [The missions](#2-the-missions): 22 missions in six phases
3. [How to run this programme](#3-how-to-run-this-programme)
4. [Reading list, keyed to missions](#4-reading-list-keyed-to-missions)
5. [Appendix: defects the missions are built on](#appendix-defects-the-missions-are-built-on)

---

## 1. Competency model

Eight dimensions. Each level is written as something a reviewer could point at
in a PR, a document, a test run or a journal entry. If a cell could not be
checked by reading your work, it does not belong in this table. A level is held
once you show its behaviours on work nobody set up for you to succeed at.

Codes used in the mission cards: **CON, API, TST, OPS, PRF, SEC, COM, DEL**.

### CON · Correctness under concurrency and async

| Junior | Mid | Senior |
| --- | --- | --- |
| Code is correct when one request runs at a time. A reported race is fixed with a delay or a boolean flag, with no test. | Names the check-then-act window in a function (for example `alreadyPassed` read at `server/index.ts:338` before the `await` at line 346). Adds a guard and a test that fires two requests concurrently and asserts the outcome. In React effects, cancels or ignores stale responses. | Before touching code, writes the invariant ("XP for a lesson is awarded at most once") and enumerates the interleavings that could break it, including across tabs, retries and restarts. Chooses between a mutex, an idempotency key and a single-writer queue and records the reason. The test is deterministic (controlled promise resolution), not a sleep. Greps the neighbouring handlers for the same pattern and lists what was found, fixed or not. |

### API · API and data design, including evolution

| Junior | Mid | Senior |
| --- | --- | --- |
| Adds a field where the UI needs it. Client types are copied by hand from the server (`web/src/api.ts:1` says "Shapes mirror server/index.ts"). | One source of truth for shared types. Every request body validated at the boundary; can point at the line where each external input enters. Reads do not write (`GET /api/state` currently rolls quests and saves at `server/index.ts:256` and `:262`). | Identifies which identifiers are persisted contracts (lesson ids are keys in `data/progress.json`) and protects them mechanically. Writes the compatibility policy (what is breaking, what is additive, how long the old shape lives) before the change. The PR says which parts of a schema are public and which are private. |

### TST · Testing strategy and verification

| Junior | Mid | Senior |
| --- | --- | --- |
| Tests pass. Debugging is `console.log`. A green run is treated as proof. | A test fails for the reason its name gives. Edge cases are listed and covered. Unit and end-to-end tests are separate. Can point at a test that cannot fail (`scripts/smoke.ts:119` only asserts the expected-pass cases). | The suite has a stated budget: wall time, flake rate and detection power. For each real bug, names the cheapest test that would have caught it. Seeds a bug and shows the suite goes red before trusting it. The untested risks are listed in writing. |

### OPS · Operability and reliability

| Junior | Mid | Senior |
| --- | --- | --- |
| Failures are swallowed so they stop appearing (`progress.ts:97` logs a failed save and returns). Stack traces are read after someone complains. | Errors are logged with context and surfaced to the user. `SIGINT`/`SIGTERM` are handled. Can explain why `rename` is atomic but not durable. | Writes the failure modes before shipping and a runbook entry for each. Defines SLOs for what users feel (grading p95, zero lost saves) and measures against them. Designs for the crash in the middle of a write. Every change either has a rehearsed rollback or is marked one-way in the PR. |

### PRF · Performance reasoning

| Junior | Mid | Senior |
| --- | --- | --- |
| Optimises what looks slow. Reports one run. | Profiles first. Reports before and after with the command used. Can point at the code-split boundary or the memoisation and say what it saves. | Builds a cost model first (where a 9 s React grading run goes: spawn, `import('typescript')`, jsdom, React). Reports distributions over N runs (p50/p95/max), never a single number. Sets a budget, adds a regression guard to CI, stops when the budget is met, and writes down what was deliberately not done. |

### SEC · Security and trust boundaries

| Junior | Mid | Senior |
| --- | --- | --- |
| Local means safe. Comments are trusted ("Learner code should not be able to read the progress file", `server/runner/index.ts:82`, is false). | Every request body validated. Output escaped. `npm audit` in CI. Can name the OWASP category for each finding. | Draws the trust boundaries, then threat-models against them (STRIDE or similar). Ranks by impact in this deployment: forged XP in a single-player app is low; LAN remote code execution through `/api/lesson/:id/run` is critical. Closes the high-impact ones, and writes down the residual risks accepted and the event that would trigger revisiting each. |

### COM · Code review and technical communication

| Junior | Mid | Senior |
| --- | --- | --- |
| PR description is one line. Review comments are style nits or "LGTM". | PR explains what and why, links the issue, lists what was tested. Review comments are specific and say what to change. | Writes decision documents (ADRs, design docs, postmortems) in which a reader can disagree with a step of the reasoning, not just the conclusion. Review findings are sorted by severity, blocking is separated from non-blocking, and each blocking comment proposes the smallest safe change. Reviews AI-written code with the same rigour as a colleague's and keeps a tally of its precision. |

### DEL · Scoping, delivery and judgement

| Junior | Mid | Senior |
| --- | --- | --- |
| The ticket is done as written. One PR at the end. | Work is split into reviewable PRs. Estimates are in days. Risks are flagged in the plan. | Changes the ticket when the ticket is wrong, and says so in writing. Ships the thinnest slice that retires the biggest risk first. Risky changes sit behind a flag with a rollback path. The PR lists what was deliberately left out. Estimates are ranges, compared with actuals afterwards, and the error is used to adjust the next estimate. |

### The one-paragraph definition

Given any change to this repository, a senior can predict what it will break
(concurrency, persisted data, the sandbox boundary, the bundle, the test
budget), can show evidence that it did not, can reverse it if it did, and can
write it up so the next person can make the same kind of change without them.

---

## 2. The missions

### Phase map and dependencies

```
Phase A  See the system                 01 → 02
Phase B  Correctness first              03 → 04
Phase C  Reliability and security       05 → 06 → 07 ; 08 → 09
Phase D  Speed with evidence            10 → 11 ; 12
Phase E  Architecture and evolution     13 → 14 ; 15 ; 16
Phase F  Quality signal, judgement, people   17 ; 18 ; 19 → 20 ; 21 (twice) ; 22 (capstone)
```

Hard dependencies: 02 (CI) before everything after it. 07 (phase timings)
before 11 (worker pool). 13 (layered server) before 14 and 16. 16 (storage
seam) before 22. 21 runs once after Mission 10 and once after Mission 20.

Effort is in focused build hours and excludes the plan, journal and retro,
which cost about two hours per mission on top. A range means the uncertainty
is real. Write your own estimate before reading mine.

---

### Phase A: See the system

#### Mission 01 · Baseline and system map

- **Goal.** A one-page request-lifecycle diagram for `POST /api/lesson/:id/submit`,
  and a baseline file of measured numbers that later missions must beat.
- **Files.** `server/index.ts` (submit route from line 331, `applyPass` from 171),
  `server/runner/index.ts` (`runExercise`, `timeoutFor` at 67, `cleanupRunDir` at 26),
  `server/runner/worker.mjs` (`main` at 521, `setupDom`, `setupPostgres`,
  `typecheckLesson`), `server/progress.ts` (`save` at 89).
- **Reported reference points, to be re-measured.** Sandbox smoke per case: js
  0.28 s, ts 0.49 s, node 0.59 s, sql 5.8 s, typecheck 4.3–5.2 s, react 9.1 s;
  the infinite-loop case took its full 10 s budget; the smoke run took about 88 s
  of wall time while the cases summed to about 36 s; `dist/assets/index-*.js`
  is 740,795 bytes (verified). One trivial `js` run took 6.8 s under load, and two
  hit the 10 s timeout. Those last three were measured with other agents' test
  suites running on the same machine.
- **Why this is senior work.** Nobody should redesign a system they have not
  measured, and the measurements must be written down so later claims can be
  checked against them.
- **Acceptance criteria.**
  - `upskilling/baseline.md` records each metric over at least 10 runs
    (p50/p95/max), with machine, Node version, command lines, and what else was
    running.
  - A diagram (ASCII is fine) with every hop from click to save file, marking
    each place a failure is swallowed. There are at least four.
  - An explanation of the wall-time gap in the smoke run, backed by evidence.
    Candidates: `tsx` startup, `sweepRunsDir`, Windows file locks in
    `cleanupRunDir`, antivirus scanning `.runs/`.
  - A list of at least five places where the code does not do what a comment or
    the README says. The appendix has more than five; find yours first.
- **Effort.** 6–10 h. **Dimensions.** PRF, OPS, COM.
- **What a senior does that a mid does not.** Reports variance, not only a
  mean, and notices that a 10 s budget with a 6.8 s trivial run means the
  timeouts will flake under load. That single observation feeds Missions 09,
  10 and 11.

#### Mission 02 · Tests that can fail, and CI that runs them

- **Goal.** Every existing check asserts what its name claims, the pure game
  logic has unit tests, and a GitHub Actions pipeline runs all of it, including
  the end-to-end and UI checks, against a server it starts and stops itself.
- **Files.** `scripts/smoke.ts:119–120` (`expectedOk` only checks the cases
  expected to pass; "typecheck fail", "infinite loop is killed" and "syntax error
  is explained" are never asserted, so `timedOut` and `phase === 'compile'` can
  regress without smoke noticing; `scripts/e2e.ts:80,86` do assert them, but e2e
  is manual and not in `npm test`). `server/gamify.ts` is described as "pure
  functions … so the rules stay testable" and has no tests: `computeXp`,
  `levelFromXp`, `bumpStreak` (freeze on a one-day gap, a freeze earned every
  fifth day, line 131), `dayBefore` across a DST change, `rollDailyQuests`
  determinism. `scripts/e2e.ts:38` calls `/api/reset` against the real save file
  because `DATA_DIR` is fixed at `server/progress.ts:11`. `scripts/ui-smoke.mjs:9`
  imports `esbuild`, which is not in `package.json` and is present only because
  Vite depends on it. The Windows retry loop in `cleanupRunDir` means CI should
  run on `ubuntu-latest` and `windows-latest`.
- **Why this is senior work.** A suite that cannot fail is worse than none. A
  pipeline that can wipe a developer's data is worse than no pipeline. Both are
  fixed by the same habit: prove the negative case.
- **Acceptance criteria.**
  - Each smoke case declares its expected `ok`, `phase` and `timedOut`, and all
    three are asserted.
  - Unit tests for `gamify.ts` using `node:test` (no new dependency). Table-driven
    cases for `computeXp`; a DST-boundary case for `bumpStreak`; a determinism
    case for `rollDailyQuests`.
  - For every new test, seed the bug it guards against (flip a comparison, drop
    the freeze branch), show the run goes red, revert. List the seeds in the PR.
  - A `PROGRESS_DIR` (or similar) env var. e2e runs against a temp directory, and
    `/api/reset` refuses unless that var is set or the request carries an
    explicit override.
  - A script starts the server on a free port, polls `/api/health` with a
    deadline, runs `test:api` and `test:ui`, and always kills the server, even on
    failure.
  - `esbuild` declared explicitly; `npm ci`; dependency caching.
  - The pipeline goes red on a seeded failure in each stage. Link the runs.
  - CI wall time recorded as the baseline for Mission 10.
  - A short note in the PR: `node:test` versus Vitest, with the trade-off stated
    in one paragraph each way.
- **Effort.** 12–18 h. **Dimensions.** TST, OPS, DEL.
- **What a senior does that a mid does not.** Makes it impossible for
  `npm run test:api` to wipe a real save file, rather than adding a warning to
  the README.

---

### Phase B: Correctness first

#### Mission 03 · Two check-then-act races, one invariant

- **Goal.** "A lesson awards XP at most once" holds under concurrent submits,
  and the React app never shows lesson B's content under lesson C's URL.
- **Files.** Server: `server/index.ts:338` reads `alreadyPassed` before the
  `await runExercise` at 346. Two concurrent submits (two tabs, a double
  Ctrl+Enter, a retry) both read `false`, both pass, and `applyPass` runs twice:
  double XP, double history entry, possibly double quest completion. All routes
  share one in-memory `cache` (`progress.ts:69`). Note that `/hint` has no
  `await` between reading `rec.hintsUsed` and incrementing it (lines 286–288),
  so it is not actually racy today; the draft's claim that it was is the kind of
  thing you should check rather than repeat. Client: `web/src/pages/Lesson.tsx:14–18`,
  the effect calls `api.lesson(id).then(setLesson, …)` with no cleanup; Next →
  Next quickly can let the earlier response win. Reset at line 226 sets
  `pristineStarter` without saving a draft, and `server/content.ts:102` prefers
  `rec.draft` on reload, so Reset does not survive a refresh. `web/src/App.tsx:60–62`
  refetches `/state` on every non-lesson route change with no cancellation.
- **Why this is senior work.** Both bugs are the same shape on opposite sides of
  the wire, and the app teaches the client version to learners in the React
  track. The senior skill is not the fix. It is writing a deterministic test for
  a race, and choosing among a mutex, idempotency keys and a single-writer
  queue with the reasons on paper.
- **Acceptance criteria.**
  - A reproduction script fires 10 concurrent submits of a correct solution and
    shows XP awarded more than once before the fix.
  - The invariant is a test that holds at 50 concurrent submits, and `/run`
    is shown to count no attempt and reset no combo under the same load.
  - A half-page design note comparing at least three approaches. Say which one
    also serialises `/draft` and `/hint`, and which would survive a multi-user
    server (Mission 22).
  - A component or `ui-smoke`-style test resolves lesson responses out of order
    and asserts the rendered lesson matches the URL. It must fail before the fix.
  - The fix uses an `AbortController` threaded through `request()` in
    `web/src/api.ts`, or an `ignore` flag, with the choice justified in the PR.
  - Reset/draft behaviour is decided, documented and tested.
  - A table of every `useEffect` and `.then` in `web/src/` with a verdict per
    entry: safe, fixed, or accepted with reason.
- **Effort.** 10–14 h. **Dimensions.** CON, TST, API, COM.
- **What a senior does that a mid does not.** Proposes serialising every state
  mutation through one path rather than locking one handler, and says what that
  costs. Mission 16 builds on that decision.

#### Mission 04 · Postmortems for two real bugs

- **Goal.** Two blameless postmortems in production format: one for a bug from
  `journal/001-building-v1-what-broke.md`, one for the Mission 03 double-award.
- **Files.** Good candidates from the journal: #1, `AbortSignal.timeout()` never
  firing in a worker (the fix is `keepAlive` at `worker.mjs:23`); #9, `beforeEach`
  applying to every test (now `hooksFor` at `worker.mjs:287`); #4, the linter that
  corrupted the files it linted (`scripts/lint-content.mjs`). Reproduce by
  reverting the fix on a scratch branch. Do not merge that branch.
- **Why this is senior work.** A postmortem turns one incident into a change that
  prevents a class of incidents. Writing one about your own bug, without blame
  and without softening, is harder than it sounds.
- **Acceptance criteria.**
  - Sections: summary, impact, timeline, detection, root cause (five whys or a
    causal graph), what went well, where we got lucky, action items. Each action
    item names the class of bug it prevents.
  - The reproduction is committed as a regression test that stays.
  - At least one action item improves detection, not only prevention. For #4
    that is `lint:content --check` in CI, because today `npm test` runs the
    linter in write mode and edits source files.
- **Effort.** 4–6 h. **Dimensions.** COM, OPS, TST.
- **What a senior does that a mid does not.** Asks why nothing caught it
  earlier, and changes the system so that its neighbours get caught too.

---

### Phase C: Reliability and security

#### Mission 05 · Save-file durability, schema migrations, and clean shutdown

- **Goal.** Progress is never silently lost: not on a corrupt file, not on a
  crash mid-write, not on Ctrl+C, and the schema can evolve.
- **Files.** `server/progress.ts`:
  - `load()` (72–86) catches every error, including a parse failure, and returns
    `fresh()`. The next `save()` overwrites the corrupt-but-recoverable file.
  - `save()` (89–101) writes a temp file and renames, never calls `fsync`, and on
    failure logs and carries on. Every route calls `res.json` before
    `await store.save()`, so the user is told "ok" for a write that may not
    happen.
  - Line 77, `{ ...fresh(), ...parsed }`, is a shallow merge. A save file from
    before a nested field existed ends up without it (for example
    `stats.sandboxMs`), and `+=` yields `NaN`.
  - `version: 1` is written (line 56) and never read.
  - `server/index.ts:439` calls `app.listen` with no signal handling; there is no
    `SIGINT` or `SIGTERM` anywhere in `server/`. The `writing` chain may be
    mid-write; workers may be running; `sweepRunsDir` (`runner/index.ts:19`)
    only cleans up after the previous process. `cleanupRunDir` is fire-and-forget
    (line 144), and `sweepRunsDir` swallows its own failures, so a locked file on
    Windows leaves debris. Review 05 also found that `sweepRunsDir` deletes other
    processes' in-flight runs when the server and `verify` share a checkout.
- **Why this is senior work.** Durability, migration and lifecycle are the
  responsibilities that come with owning persisted user data. The Node track
  teaches graceful shutdown; the app should do what it teaches.
- **Acceptance criteria.**
  - A corrupt file is quarantined as `progress.corrupt-<ts>.json`, logged loudly,
    and the UI shows a banner. It is never overwritten.
  - A rolling backup of the last N good saves.
  - An ordered migration list keyed by `version`, a test per migration, and a
    committed v1 fixture file that loads.
  - A crash-consistency test: kill the process in a loop during saves (at least
    200 iterations) and assert every file on disk parses and is either the old or
    the new state.
  - A written, measured decision on whether the response should wait for the
    write, and whether to `fsync`.
  - On `SIGINT`/`SIGTERM`: stop accepting, let in-flight grading finish within a
    deadline (then terminate), flush `save()`, close, exit with the right code.
    A second Ctrl+C force-exits.
  - A test sends `SIGINT` mid-submit and asserts the save file holds the
    completed or the prior state, never a partial one, and no worker outlives
    the process.
  - Runner cleanup is awaitable on shutdown. The `.runs/` sharing problem is
    either fixed (per-process run dir) or documented as accepted, with the reason.
- **Effort.** 14–20 h. **Dimensions.** OPS, API, TST, CON.
- **What a senior does that a mid does not.** Explains the difference between
  atomic and durable (rename, `fsync` of the file, `fsync` of the directory),
  measures what durability costs here, and then decides which guarantee this app
  actually needs. Documents the Windows differences in signal delivery.

#### Mission 06 · Async errors, one error envelope, consistent authorisation

- **Goal.** No request can crash the server, every error has one shape, and the
  unlock rules are enforced the same way on every route.
- **Files.** `server/index.ts` uses `async` handlers on Express 4
  (`package.json`: `^4.21.2`), which does not forward rejected promises to
  `next()`. If `runExercise` rejects (for example `mkdir` at
  `runner/index.ts:72` fails), the rejection is unhandled, and Node 15+ exits
  the process by default. Today the reachable paths are narrow, because
  `store.load()` never throws and `locate` never throws; the point is that the
  next contributor will add one. Errors are `{ error: string }` with ad-hoc
  status codes. `/submit` checks `lessonUnlocked` (line 335); `/hint`,
  `/solution`, `/run` and `GET /lesson/:id` do not, so a locked lesson's brief,
  hints and grader are reachable.
- **Why this is senior work.** The failure path is the design. Consistent
  status codes and a stable machine-readable error shape are what make an API
  usable by a second client.
- **Acceptance criteria.**
  - A test injects a rejection into `runExercise` and shows the process survives
    with a 5xx response.
  - One error middleware and envelope (RFC 9457 Problem Details is a reasonable
    choice) with stable `code`s. `web/src/api.ts` `request()` understands it.
  - A table in the PR: every endpoint, which unlock check it needs, and why. Then
    enforce it.
  - A deliberate `process.on('unhandledRejection')` policy. Log-and-exit is a
    defensible answer if you say why.
- **Effort.** 6–9 h. **Dimensions.** OPS, API, SEC.
- **What a senior does that a mid does not.** Treats "which errors are 4xx and
  which are 5xx" as a contract, and notes that Express 5 changes the async
  behaviour (Mission 18), so the fix should not depend on the Express version.

#### Mission 07 · Observability: structured logs, phase timings, a runbook

- **Goal.** You can answer "why was grading slow at 14:02?" from the data alone.
- **Files.** Today: `console.log` at startup, `console.error` in `save()`, and
  `p.stats.sandboxMs`, a running sum that hides the distribution. No request
  ids, no per-kind timings, no split between spawn, compile, environment setup
  and tests. `worker.mjs:565` already posts `{ progress }` messages, which can
  carry phase timings.
- **Why this is senior work.** Operability is designed in. The skill is picking
  the few signals that matter and making them cheap to read.
- **Acceptance criteria.**
  - JSON-lines logs with a request id carried into the runner. Phase timings from
    the worker: spawn, `import typescript`, compile, env setup, tests, teardown.
  - `GET /api/metrics` (or a dev-only page) with p50/p95/max per lesson kind and
    outcome counts (pass, fail, timeout, crash).
  - Two SLOs with rationale, for example "p95 grading latency below 3 s for
    js/ts/node" and "zero lost saves".
  - `upskilling/RUNBOOK.md` covering at least: grading times out, save failed,
    port in use, `.runs/` fills the disk.
- **Effort.** 8–12 h. **Dimensions.** OPS, PRF, COM.
- **What a senior does that a mid does not.** Instruments the phases, so
  Mission 11 can prove where the time goes instead of guessing.

#### Mission 08 · Threat-model the sandbox and close two holes

- **Goal.** A written threat model of the whole app, and the two highest-impact
  holes closed with tests.
- **Files.** Each of these is visible by reading; the draft's author also
  confirmed the first three with probes.
  1. **Result forgery.** Learner code is imported at `worker.mjs:547` in the same
     thread that owns `parentPort`. It can `import { parentPort } from
     'node:worker_threads'` and post `{ ok: true, tests: [...] }`. The parent
     (`runner/index.ts:114–119`) accepts the first non-progress message as the
     verdict.
  2. **Harness tampering.** Globals are assigned at `worker.mjs:292`, learner
     code loads at 547, the spec at 556. `globalThis.expect = …` in learner code
     makes every assertion pass. Patching `Array.prototype.every` does the same,
     since `main()` computes `ok` with it at line 586.
  3. **No filesystem or process isolation.** `env: { NODE_ENV: 'sandbox' }` at
     `runner/index.ts:83` only replaces `process.env`. A worker thread shares the
     process; it can read and write `data/progress.json` and use
     `child_process`. The comment on line 82 is false.
  4. **Network exposure.** `app.listen(PORT)` at `server/index.ts:439` binds all
     interfaces. Anyone on the LAN can `POST /api/lesson/:id/run` arbitrary code.
     No `Host` or `Origin` check, so DNS rebinding from any website works too.
  5. **Future XSS.** `web/src/components/bits.tsx:13` renders `marked` output via
     `dangerouslySetInnerHTML`, with a comment (lines 10–11) that this is fine
     because content is first-party. It stops being fine the day content comes
     from files (Mission 15) or from other learners (Mission 22).
- **Why this is senior work.** Ranking by impact in this deployment is the
  skill. Forged XP in a single-player app means cheating yourself. LAN RCE means
  anyone on the coffee-shop wifi owns your laptop. A mid fixes the most
  interesting hole; a senior fixes the most dangerous one.
- **Acceptance criteria.**
  - `upskilling/THREAT-MODEL.md`: assets, actors, trust-boundary diagram, a
    STRIDE table, and a likelihood × impact ranking.
  - Close hole 4: bind to `127.0.0.1` by default; LAN access only via an explicit
    flag that prints a warning; a `Host`/`Origin` allowlist. Tests for each.
  - Close one more, with the choice justified. Options: run graders in a child
    process under Node's permission model (`--permission`, narrow
    `--allow-fs-read`, no child processes; permissions are process-wide, so this
    cannot be done per worker thread). Or capture a private `MessageChannel`
    before learner code loads and have the parent compute `ok` from per-test
    events.
  - Every probe above becomes a smoke case that asserts the attack fails, or is
    documented as accepted.
  - A residual-risk section that is honest: in-realm grading cannot be made
    tamper-proof, and here is what would change that.
- **Effort.** 12–20 h. **Dimensions.** SEC, COM, CON.
- **What a senior does that a mid does not.** Writes down the risks being
  accepted and the trigger for revisiting each one.

#### Mission 09 · Admission control and a load test

- **Goal.** Under concurrent grading the server degrades predictably instead of
  timing out correct code.
- **Files.** No concurrency cap in `runner/index.ts`. Each worker gets
  `maxOldGenerationSizeMb: 512` (line 84). React and SQL runs take 6–9 s cold.
  `timeoutFor` (line 67) budgets are wall-clock from before the worker spawns
  (line 73), so under CPU contention correct code times out; the author saw
  10 s timeouts on a trivial `js` case, and Review 05 saw reference solutions
  time out under load. Logs are capped at 200 entries (`worker.mjs:40`), not
  bytes, so a `console.log` of a 50 MB string crosses `postMessage` unchecked.
- **Why this is senior work.** Bounded queues and backpressure are the opposite
  of "add more workers". Choosing the limit from a measured knee is the part
  most people skip.
- **Acceptance criteria.**
  - A load test (autocannon or a small script) with a mix of lesson kinds at
    increasing concurrency. Tabulate throughput, p95 and timeout rate before and
    after.
  - A bounded semaphore sized from measurement, not `os.cpus().length`. When
    full: `429` with `Retry-After`, or a queue with a visible position. The UI
    shows it.
  - Timeouts measure time since the run started executing, not time queued.
  - A byte cap on logs and the result payload with a truncation marker.
- **Effort.** 10–14 h. **Dimensions.** PRF, CON, OPS.
- **What a senior does that a mid does not.** Explains why queueing beats
  rejecting for a single-user app, or the reverse, with the numbers that decided
  it.

---

### Phase D: Speed with evidence

#### Mission 10 · Parallel verify with a flake budget

- **Goal.** `npm test` wall time cut to a third, with a measured flake rate under
  a written budget.
- **Files.** `scripts/verify-content.ts:163–205` runs every code lesson's
  reference and then its starter serially (62 code lessons, so up to 124
  grading runs; the 10 quizzes are skipped at line 171). `package.json` `test`
  chains typecheck, `lint:content`, `test:sandbox` and verify serially although
  the first two are independent. Node lessons bind port 0 (ten `listen(0` calls
  in `content/node/index.ts`), so they can run in parallel. Eight graders assert
  wall-clock bounds with `toBeLessThan(`; those will flake first. PGlite and
  jsdom memory multiplied by N is the real constraint.
- **Why this is senior work.** Parallelism exposes shared state. Budgeting
  flakes rather than retrying them silently is what separates a fast suite from
  a suite nobody trusts.
- **Acceptance criteria.**
  - A bounded pool behind a CLI flag. Output order is deterministic regardless
    of concurrency.
  - A per-lesson timing report with the ten slowest.
  - The full suite run 20 times at the chosen concurrency; the flake rate
    recorded; the budget written ("0 in 20, otherwise concurrency drops a
    step"); CI pins the setting.
  - Peak memory of the parallel run measured and reported.
  - Before and after wall time locally and in CI (from Mission 02).
- **Effort.** 8–12 h. **Dimensions.** PRF, TST, CON.
- **What a senior does that a mid does not.** Treats every flake as a bug
  report about shared state. Quarantine is a documented, time-boxed exception,
  never a silent retry.

#### Mission 11 · Warm worker pool that halves p50 grading latency, with isolation intact

- **Goal.** Halve p50 grading latency per kind, and prove isolation still holds.
- **Files.** Each run spawns a fresh `Worker`. `worker.mjs:13` imports
  `typescript` at the top level even for SQL runs, which never compile anything.
  jsdom or PGlite is booted per run. Harness state lives in module scope
  (`registered`, `rootSuite`, `logs`) and on `globalThis`, so reusing a worker
  across runs would leak state between runs.
- **Why this is senior work.** The obvious design (reuse workers) breaks
  isolation. The likely right design is pre-warming: a spare worker per kind
  that has paid its import costs, used once, then discarded. Proving that needs
  the Mission 07 phase timings.
- **Acceptance criteria.**
  - A per-kind cost breakdown from Mission 07 data before any change.
  - The cheap fix first: `typescript` behind a dynamic import. Measure how much
    of the target that alone meets.
  - The pool: size per kind, replenish after each run, recycle on timeout, a cap
    on memory held by spares.
  - p50 halved for react, typecheck and sql over 30 runs each. p95 must not
    regress.
  - An isolation suite: a run that sets globals, patches prototypes, leaves
    timers and writes files, followed by a clean run that must see none of it.
    Kept in CI.
  - A flag to turn the pool off, and the reason for the default.
- **Effort.** 14–20 h. **Dimensions.** PRF, CON, SEC, TST.
- **What a senior does that a mid does not.** Ships the lazy import as its own
  PR, and is willing to stop there if it meets the budget.

#### Mission 12 · Is the bundle worth optimising? A time-boxed judgement

- **Goal.** Decide, with numbers, whether the README's claim that the 740 KB
  bundle "costs nothing worth optimising" is true, and act on the answer within
  a fixed budget.
- **Files.** `dist/assets/index-*.js` is 740,795 bytes as one chunk.
  `web/src/pages/Lesson.tsx:2–5` statically imports `@uiw/react-codemirror`,
  both language packs and `oneDark`; `web/src/App.tsx:5` statically imports
  `LessonView`, so the dashboard pays for the editor. `App.tsx:60–62` refetches
  the whole `/api/state` payload on every non-lesson navigation.
- **Why this is senior work.** The mid-level answer is to code-split because
  code-splitting is good. The senior answer is a measurement, a threshold, and
  a willingness to write "not worth it" in the README with the evidence. The
  time box is the point: five hours, then decide.
- **Acceptance criteria.**
  - A bundle breakdown (rollup visualiser or esbuild metafile).
  - Dashboard time-to-interactive on the production build with 4× CPU
    throttling, median of five, before any change.
  - A written threshold set before measuring ("worth it if TTI drops by more
    than X ms on the throttled profile").
  - If over the threshold: `React.lazy` for the lesson route, a size budget
    check in CI, and after numbers. If under: the README paragraph rewritten to
    say what was measured, and nothing else shipped.
  - Either way, one unnecessary render or request identified with the React
    Profiler and removed, or a note that there was none worth the change.
- **Effort.** 3–5 h, hard cap. **Dimensions.** PRF, DEL.
- **What a senior does that a mid does not.** Stops at the cap and writes down
  what they chose not to do.

---

### Phase E: Architecture and evolution

#### Mission 13 · Refactor `server/index.ts` into layers, under characterization tests

- **Goal.** Routes become thin. Domain rules live in a service with no Express
  or filesystem imports and an injected clock.
- **Files.** `server/index.ts` (445 lines) mixes HTTP, projections (`profile`,
  `trackTree`, `achievementBoard`), domain rules (`applyPass`, `syncQuests`) and
  persistence. `nextRankFor` (line 57) hard-codes `[1, 3, 5, 8, 11, 14, 18, 22]`,
  duplicating the private `RANKS` in `gamify.ts:25`. `gradeQuiz` (line 384)
  lives in the route file. `new Date()` is called directly in `applyPass`,
  `record`, `log`, `dayKey` and the "Night Shift" achievement, which is why
  streaks and quests have no tests.
- **Why this is senior work.** Refactoring without behaviour change, with proof,
  is a core senior skill. The proof comes first.
- **Acceptance criteria.**
  - First PR: characterization tests that record current responses for a
    scripted play-through (golden JSON, timestamps normalised). They pass
    against untouched code.
  - Following PRs: extract services with injected clock and store.
    Characterization tests stay green at every commit.
  - `nextRankFor` derives from `RANKS`. One source of truth for rank thresholds.
  - Every PR reviewable in 15 minutes. Link them in the journal.
- **Effort.** 12–18 h. **Dimensions.** API, TST, DEL.
- **What a senior does that a mid does not.** Injects the clock, which makes
  streaks, quests and "Night Shift" testable for the first time, and keeps
  refactor commits separate from behaviour changes.

#### Mission 14 · Contracts: shared types, side-effect-free reads, persisted ids

- **Goal.** One source of truth for request and response shapes, `GET`s that do
  not write, and lesson ids treated as the persisted contract they are.
- **Files.** `web/src/api.ts` redeclares `LessonKind` (line 3), `Profile`,
  `Quest`, `RunResult` and others by hand. `Quest` has already drifted: the
  server's (`gamify.ts:137`) has `metric` and `kind`; the web's (`api.ts:64`)
  does not. `AppState.days` on the web has two fields; the server's has six.
  Because the web `LessonKind` is a separate union, adding a kind on the server
  does not break `KIND_LABEL` or `KIND_LANG` (`api.ts:210,221`). `GET /api/state`
  rolls quests and saves (`server/index.ts:256,262`). `p.lessons` in
  `data/progress.json` is keyed by lesson id; `server/content.ts:25` throws on
  duplicates but does nothing for ids that disappear. A renamed lesson strands
  its record, which still counts in `passed.length` for achievements
  (`gamify.ts:220–227`) and is ignored by `readiness`. `lessonUnlocked`
  (`content.ts:62`) depends on the previous lesson's id, so inserting a lesson
  mid-chapter re-locks lessons a learner has already reached.
- **Why this is senior work.** This is Hyrum's Law applied: which identifiers
  and shapes are contracts, whether or not anyone declared them. The draft
  proposed an `/api/v2` with a deprecation window; for a single-client local app
  that is ceremony. The real contract here is the save file, not the HTTP API.
  Say so, and version the thing that needs versioning.
- **Acceptance criteria.**
  - `shared/contracts.ts` (schemas with inferred types, or types plus
    validators) imported by both halves. `tsc` fails if either side drifts.
    Adding a `LessonKind` on the server is a compile error in the web app.
  - A contract test in CI: every response in the e2e run validates against its
    schema.
  - `GET`s are side-effect free: quest rollover moves to a write path or is
    computed lazily. Error envelope from Mission 06 throughout.
  - A `content.lock.json` of shipped ids; `npm run verify` fails if an id
    vanishes without a `renamedFrom` or `retired` entry.
  - A migration step at load that re-keys renamed lessons and archives retired
    ones, tested with fixtures.
  - A decision, with tests, on what inserting a lesson mid-chapter does to a
    learner who already passed the lessons after it.
  - A one-page compatibility policy: what counts as breaking for the save file,
    for the API, and for content ids.
- **Effort.** 12–18 h. **Dimensions.** API, TST, COM, OPS.
- **What a senior does that a mid does not.** Writes the policy before the
  code, and asks "what does this do to existing users?" before "does it work
  for new ones?".

#### Mission 15 · ADR: write one, defend one, review one

- **Goal.** Practise the whole life of an architecture decision record: author
  one with real alternatives, have it attacked, and review someone else's.
- **Files.** Two live decisions to choose from:
  - **Content format.** Lessons are TypeScript objects in
    `content/<track>/index.ts` (`content/node/index.ts` alone is 3,325 lines).
    Code, specs and markdown live inside template literals, which is why
    `scripts/lint-content.mjs` exists and why `content/AUTHORING.md` has a
    section titled "Escaping, which is the only tedious part". `lint:content`
    in `package.json` hard-codes the six files. The README defends the current
    choice: "a malformed lesson is a compile error".
  - **The XP curve and rank naming.** Base lesson XP totals 6,785 and
    achievements 5,085 (both verified). Reaching Senior-Track (level 22) needs
    12,600 cumulative XP, so a player who completes 100% with no bonuses lands
    at level 21, "Mid III". The 100% achievement is called "Mid-Level" and the
    top rank "Senior-Track" in an app that promises junior→mid. Changing the
    curve changes every existing player's level.
- **Why this is senior work.** An ADR must present the strongest version of the
  option it rejects. Reviewing an ADR is a different skill from writing one:
  you are checking the reasoning, not the prose.
- **Acceptance criteria.**
  - `upskilling/adr/0001-<slug>.md` in Nygard format (context, decision, status,
    consequences). At least three options, scored on criteria stated before
    scoring. For the content format, the options should include: status quo; a
    directory per lesson (`lesson.md` with frontmatter, `starter.ts`,
    `solution.ts`, `spec.ts`); a hybrid TS manifest importing raw files.
  - The ADR is reviewed by one human or AI reviewer instructed to argue for the
    rejected option. The disagreements and their resolution are appended to the
    ADR.
  - If the decision is to change: a migration script and an equivalence test
    proving every lesson loads identical (normalised) to the old loader, over all
    72 lessons; `npm run verify` stays green; a security note that file-sourced
    Markdown means `bits.tsx` must sanitise (Mission 08). For the XP curve: a
    save migration with a stated grandfathering rule (Mission 05 fixtures).
  - If the decision is to keep the status quo: the pain is addressed some other
    way (tooling, lint, generated types), with the same evidence bar.
  - **Review one you did not write.** Take the README's "Choices worth
    explaining" section, treat each paragraph as an ADR, and write a review of
    one of them: what is missing, which alternative was not considered, what
    would change the decision. Keep it under a page.
- **Effort.** 8–12 h. **Dimensions.** COM, API, DEL.
- **What a senior does that a mid does not.** Is willing to write "keep the
  status quo" and defend it, and can tell a reviewer the exact fact that would
  make them change their mind.

#### Mission 16 · Storage swap to PGlite, feature-flagged, with rollback and a scope cut

- **Goal.** Durable storage in embedded Postgres behind a flag, with an online
  migration, a rehearsed rollback, and a written mid-mission scope cut.
- **Files.** `server/progress.ts` exports `load/save/reset/record/today/log`
  over one mutable `cache`, and `server/index.ts` mutates it directly. PGlite
  (`@electric-sql/pglite ^0.2.17`) is already a dependency, used by the sandbox
  (`worker.mjs:395`). The README's reason for JSON, "survives being copied to a
  USB stick", is a requirement your design must keep: PGlite can persist to a
  directory.
- **Why this is senior work.** This is the standard shape of a storage
  migration: seam, schema, dual-write, verification, cutover, rollback, under a
  product constraint. It is also deliberately larger than its budget. The point
  of the scope-cut criterion is to practise saying "not this, not now" in
  writing while the work is live, not in the retro.
- **Acceptance criteria.**
  - A `ProgressStore` interface (on Mission 13's seam) with `JsonStore` and
    `PgliteStore` sharing one contract-test suite.
  - A normalised schema (`lesson_records`, `history`, `days`, …) with
    constraints that encode invariants (`unique(lesson_id)`, `xp_awarded >= 0`).
    Consider storing `history` as the event log it already is.
  - `STORE=json|pglite|dual`. In `dual`, write both, read JSON, log divergence.
  - Migration imports an existing `progress.json` (Mission 05 fixtures) and
    verifies with a deep-equal round-trip. It is idempotent.
  - Rollback: PGlite → JSON export restores full fidelity. Rehearse it; keep the
    transcript.
  - Latency impact on submit and `/state` measured.
  - Awarding XP is one transaction, which answers Mission 03 at the storage level.
  - **Scope cut.** At the halfway point of your estimate, or when actual hours
    reach 1.5× the estimate, whichever comes first, write
    `upskilling/scope-cuts/016.md`: what is cut, what risk it leaves, what would
    bring it back, and the new estimate. Then finish to the cut scope. A
    mission with no cut needs a note saying why none was needed, and a reviewer
    is entitled to disbelieve it.
- **Effort.** 20–28 h. **Dimensions.** API, OPS, DEL, CON.
- **What a senior does that a mid does not.** Leaves the flag defaulted to
  `json` until `dual` has run clean for a stated period, and writes down the
  exit criteria for that period before it starts.

---

### Phase F: Quality signal, judgement, people

#### Mission 17 · Measure grader strength across the curriculum

- **Goal.** Find the weakest graders among the 72 lessons by mutation testing
  the reference solutions, and raise the floor with a ratchet.
- **Files.** `npm run verify` proves the reference passes and the starter fails
  (`scripts/verify-content.ts:173–199`). It does not prove the tests catch a
  plausible wrong answer. Review 05 sampled mutants and found survivors.
  Generate mutants of each `solution` (operator swaps, removed `await`, boundary
  changes, removed `finally`) and run them against `tests` through
  `runExercise`.
- **Why this is senior work.** It improves a quality signal across a whole
  corpus and prioritises by impact. The ratchet is the senior part: the
  standard rises without blocking all work.
- **Acceptance criteria.**
  - `npm run grader-strength` writes a per-lesson mutation score and the
    surviving mutants.
  - Triage of the bottom 10: for each survivor, equivalent mutant or real gap.
  - The three worst real gaps fixed by strengthening `tests`; verify still green.
  - A CI threshold for new lessons only.
  - **Stretch (optional, +12–20 h).** A `mutation` lesson kind where the learner
    writes the tests and must kill every mutant. Touches `LessonKind` in
    `content/types.ts:9`, `main()` in `worker.mjs`, `timeoutFor`, verify rules,
    `KIND_LABEL`/`KIND_LANG` (compile-enforced after Mission 14), the quest pool
    and `AUTHORING.md`. Only do this if Mission 20 wants it.
- **Effort.** 10–16 h. **Dimensions.** TST, DEL, PRF.
- **What a senior does that a mid does not.** Recognises equivalent mutants
  instead of chasing 100%, and designs mutants from real bug classes (the
  Mission 04 postmortems), not random operator swaps.

#### Mission 18 · Dependency upgrades, risk-ranked, one PR each

- **Goal.** A risk-ranked upgrade plan and staged execution where each step can
  be reverted on its own.
- **Files.** `package.json` pins Express `^4.21.2`, React `^18.3.1`, PGlite
  `^0.2.17`, TypeScript `^5.6.3`. Express 5 forwards rejected promises from
  async handlers (changes Mission 06's behaviour) and its path matching rejects
  the bare `'*'` at `server/index.ts:433`. PGlite and TypeScript upgrades change
  grading behaviour for learners: diagnostic text and codes, Postgres version.
  React 19 changes `act` and Testing Library interplay in `setupDom`.
- **Why this is senior work.** The question for each dependency is what
  observable behaviour changes for our users. Here that includes learners'
  grades, which no test in the repo currently pins.
- **Acceptance criteria.**
  - A table per upgrade: breaking changes from the official migration guide,
    blast radius here (file references), how to verify, how to roll back.
  - One PR per upgrade, ordered by risk. `npm run verify` is the regression
    oracle; diff its full output before and after.
  - A policy for future upgrades: cadence and what checks for them (Renovate or
    Dependabot).
- **Effort.** 8–14 h. **Dimensions.** DEL, OPS, TST.
- **What a senior does that a mid does not.** Treats "the grader's error text
  changed" as a user-facing change that needs a note, even when every test
  passes.

#### Mission 19 · Review a change you did not write

- **Goal.** Find the defects, sort them by severity, and write so the author
  learns.
- **Setup.** Ask an AI coding agent to implement a feature on a throwaway
  branch without your guidance: "export progress as CSV from the Stats page",
  "add `/api/lesson/:id/reset`", "keyboard navigation between lessons".
  Separately, have a colleague or a second AI session plant three subtle bugs
  in a copy of one of your merged mission PRs.
- **Files.** The risky places are known from earlier missions: the shared
  `cache` (03), save durability (05), async errors and unlock rules (06), `GET`
  side effects (14), the sandbox boundary (08).
- **Why this is senior work.** Review is where a senior's judgement reaches
  code they did not write. Reviewing AI output well is now part of the job.
- **Acceptance criteria.**
  - A written review in the tone you would use with a new colleague, with
    severity labels (blocking, should-fix, nit, question).
  - For the planted-bug PR: how many of the three you found, how long it took,
    and which checklist item would have caught each one you missed.
  - `upskilling/REVIEW-CHECKLIST.md`, specific to this codebase, one page,
    updated from what you missed.
  - One paragraph comparing the failure patterns you saw in AI-written code
    with those in your own.
- **Effort.** 6–10 h. **Dimensions.** COM, SEC, CON.
- **What a senior does that a mid does not.** Leaves fewer, higher-value
  comments, and for each blocking one proposes the smallest change that
  unblocks the author.

#### Mission 20 · Teach it: write lessons, and adversarially review someone else's

- **Goal.** Turn two of your missions into graded lessons in `content/`, and
  write the adversarial review of a lesson you did not write.
- **Files.** `content/AUTHORING.md`, `content/types.ts`, one new track file or
  an addition to `content/craft/index.ts`. `npm run verify` and, if you built
  it, `npm run grader-strength`.
- **Why this is senior work.** Teaching forces you to say exactly what the
  skill is and to build a grader that can tell whether someone has it. The
  review half is the harder skill: attacking a lesson's grader and brief the way
  Review 04 attacked the curriculum, and being specific enough that the author
  can act.
- **Acceptance criteria.**
  - At least two new lessons drawn from your missions, for example a `node`
    lesson on the double-award race with a grader that fires concurrent
    requests, and a `quiz` on ranking a threat model. Each has a starter that
    fails, a solution that passes, three hints, and a `why` line a mid-level
    engineer would agree with.
  - Mutation score for each new lesson at or above the Mission 17 threshold.
  - **Adversarial review of a lesson you did not write.** Pick one existing
    lesson (a boss is best). Write a review of at most one page: can the grader
    be passed by wrong code (show the code); is the brief ambiguous (quote the
    sentence); is the reference solution the one you would ship; what would you
    change. Then fix at least one thing you found, with verify green.
  - A short lesson plan (half a page) written for a specific mid-level engineer
    you know, saying which mission of theirs the lesson would go in and why.
- **Effort.** 10–14 h. **Dimensions.** COM, TST, DEL.
- **What a senior does that a mid does not.** Writes the grader before the
  brief, so the brief promises only what the grader can check.

#### Mission 21 · Calibration: your estimate error, twice

- **Goal.** Measure how wrong your estimates are, find the direction of the
  error, and change how you estimate the remaining missions.
- **Files.** `upskilling/estimates.md`, a table you have been keeping since
  Mission 01: mission, estimated range, actual, ratio, one line on the cause.
- **Why this is senior work.** Seniors are not better at guessing. They are
  better at knowing which way they guess wrong, and by how much, and saying so
  before they are asked.
- **Acceptance criteria.** Run once after Mission 10 and once after Mission 20.
  - For every completed mission: actual ÷ midpoint of the estimate. Report the
    median ratio, the range, and how many actuals fell inside the estimated
    range at all.
  - A classification of the overruns: unknown unknowns, scope growth, tooling
    friction, optimism. Which class dominates.
  - The estimates for the remaining missions rewritten using the measured
    ratio, with the rule you applied stated in one sentence.
  - The second run compares its ratio against the first. If it did not improve,
    say what you will change; if it did, say what changed.
- **Effort.** 2–3 h each. **Dimensions.** DEL, COM.
- **What a senior does that a mid does not.** Reports the number even when it
  is embarrassing, and adjusts the plan instead of the story.

#### Mission 22 · Capstone: classroom mode, a design doc and a thin slice

- **Goal.** Turn a single-player local app into a multi-learner server for a
  bootcamp cohort. Write the design doc, have it attacked, ship a vertical slice
  behind a flag.
- **Files.** Every earlier mission changes meaning here. Forged XP (08) becomes
  cheating a leaderboard. The sandbox becomes a boundary between users, so
  in-realm grading is no longer acceptable. The in-memory `cache` must become
  per-user and transactional (16). `app.listen` must be network-reachable,
  reversing 08 on purpose, with auth. Admission control (09) becomes per-user
  fairness.
- **Why this is senior work.** It combines architecture, security, capacity
  planning, migration and scoping in one document. The slice tests whether you
  can cut scope to something shippable in a week.
- **Acceptance criteria.**
  - A design doc: goals and non-goals, a capacity estimate (30 learners at one
    submit per minute: CPU-seconds per kind from Mission 07 data), an updated
    threat model, a data model (from 16), auth choice, rollout and rollback, and
    open questions.
  - Reviewed by at least one human or AI reviewer instructed to attack it.
    Record the disagreements and their resolution.
  - A slice: two users, separate progress, per-user rate limits, graders in
    out-of-process isolation. Behind `MODE=classroom`, single-player behaviour
    unchanged, proved by the Mission 13 characterization tests.
  - A scope-cut note as in Mission 16, written at the halfway point.
- **Effort.** 24–40 h. **Dimensions.** All eight.
- **What a senior does that a mid does not.** Argues the non-goals as carefully
  as the goals, and ships a slice small enough that the review can be about the
  design rather than the volume.

---

### Mission summary

| # | Mission | Hours | Primary dimensions |
| --- | --- | --- | --- |
| 01 | Baseline and system map | 6–10 | PRF OPS COM |
| 02 | Tests that can fail, and CI | 12–18 | TST OPS DEL |
| 03 | Two races, one invariant | 10–14 | CON TST API COM |
| 04 | Postmortems | 4–6 | COM OPS TST |
| 05 | Durability, migrations, shutdown | 14–20 | OPS API TST CON |
| 06 | Async errors, envelope, authorisation | 6–9 | OPS API SEC |
| 07 | Observability and runbook | 8–12 | OPS PRF COM |
| 08 | Threat model and two holes | 12–20 | SEC COM CON |
| 09 | Admission control and load test | 10–14 | PRF CON OPS |
| 10 | Parallel verify and flake budget | 8–12 | PRF TST CON |
| 11 | Warm worker pool | 14–20 | PRF CON SEC TST |
| 12 | Bundle: time-boxed judgement | 3–5 | PRF DEL |
| 13 | Layered refactor | 12–18 | API TST DEL |
| 14 | Contracts: types, reads, ids | 12–18 | API TST COM OPS |
| 15 | ADR: write, defend, review | 8–12 | COM API DEL |
| 16 | PGlite storage swap with scope cut | 20–28 | API OPS DEL CON |
| 17 | Grader strength | 10–16 | TST DEL PRF |
| 18 | Dependency upgrades | 8–14 | DEL OPS TST |
| 19 | Reviewing others' code | 6–10 | COM SEC CON |
| 20 | Teach it, and review a lesson | 10–14 | COM TST DEL |
| 21 | Calibration (twice) | 4–6 | DEL COM |
| 22 | Capstone: classroom mode | 24–40 | all |
| | **Build hours** | **221–336** | |
| | **Plus plan, journal, retro at ~2 h × 22** | **≈ 265–380** | |

**Calendar time, honestly.** At eight focused hours every week, 265–380 h is
8–11 months. Alongside a full-time job, eight hours every week does not happen:
six hours in a normal week and one week in five lost to life is about 4.8
effective hours, which makes it 13–18 months. Plan for the second number and
be pleased by the first. The draft said 8–12 months; that assumed the good
weeks are all of them.

---

## 3. How to run this programme

### Cadence

- **Weekly rhythm (six to eight hours).** Two build sessions and one writing
  session of at least 90 minutes. The writing session is not optional; it is
  where most of the growth happens.
- **Per-mission loop.**
  1. **Plan (one page, before code).** Restate the goal, list the risks, sketch
     the approach, list what you will not do, estimate hours as a range. Add
     the estimate to `upskilling/estimates.md`.
  2. **Baseline.** Measure or reproduce current behaviour first. No baseline,
     no mission.
  3. **Build in small PRs.** Each reviewable in 15 minutes. Refactors and
     behaviour changes in separate PRs.
  4. **Scope check at the halfway point of the estimate.** If you will not
     finish inside 1.5× the estimate, write a scope-cut note (format in
     Mission 16) before continuing. This applies to every mission, not only
     16 and 22.
  5. **Evidence pack.** Tests, numbers or transcripts, attached to the PR.
  6. **Self-review** with the rubric below, then external review.
  7. **Journal entry.** Mandatory.
  8. **Retro (15 minutes).** Actual hours into `estimates.md`, and what surprised
     you.
- **Every six missions: calibration checkpoint.** Re-score yourself on all
  eight dimensions, pick the two weakest, and choose missions that exercise
  them next. Reordering within a phase is fine; skipping hard dependencies is
  not.
- **Every quarter:** re-read your first journal entries. If you would not make
  the same decision today, write a short follow-up saying why.

### Self-review rubric (score each mission 1–4 per exercised dimension)

| Score | Meaning | Test you apply to your own PR |
| --- | --- | --- |
| 1 | Junior | Works on the happy path. Evidence is "I tried it". |
| 2 | Mid | Edge cases tested. PR explains what and why. Numbers are single runs. |
| 3 | Senior-emerging | Invariants stated. Failure modes listed and tested. Distributions reported. Alternatives in writing. Rollback exists. |
| 4 | Senior | All of 3, plus: the system now catches the whole class of problem (a lint, CI gate, type, ratchet or runbook); what you chose not to do is written down; someone else could extend the work from the docs alone. |

A mission is done when every acceptance criterion has evidence and it scores 3
or more on each dimension it exercises. Log the scores in the journal.

**Pre-PR checklist (paste into every PR description):**

- [ ] What invariant does this change protect or introduce? Is it tested?
- [ ] What happens on the second concurrent call? On a crash halfway through? On restart?
- [ ] What persisted data or API shape does this touch? Is it backward compatible?
- [ ] What is the rollback? Is anything one-way?
- [ ] What did I measure, how many runs, on what machine, with what else running?
- [ ] What did I deliberately leave out, and where is that written?
- [ ] Which new trust boundary, input or dependency does this add?
- [ ] Estimate versus actual so far, and did I write a scope-cut note if needed?

### Getting review from an AI

AI reviewers default to agreeable and generic. To get value:

1. Review your own work first and write down what you think the problems are.
   Then compare. The gap between the two lists is what you learn.
2. Give it the repository and ask it to attack, not approve: "You are reviewing
   a PR to a Node/Express app whose grading sandbox runs untrusted code in
   `worker_threads`. Find the three most serious defects. For each: file and
   line, the failing scenario step by step, and a test that would expose it. If
   you find none, say which scenario you tried hardest to break."
3. Demand falsifiable claims. Every finding comes with a reproduction or a
   test. Discard what you cannot reproduce, and note that you did.
4. Use separate sessions for design review and code review. For design docs
   (Missions 15, 16, 22), ask for "the strongest argument for the option I
   rejected".
5. Never paste your conclusions into the prompt. It will agree with them.
6. Track its precision. Keep a tally in the journal of findings that were real
   versus noise. That calibrates how much to trust it and teaches you its blind
   spots (Mission 19).

`upskilling/reviews/` is a cross-check after you have done your own analysis
in Missions 01 and 08. Not before.

### Getting review from a human

- Ask for a specific kind of review. "Check the concurrency argument in
  `design.md` §3; skip style" gets better feedback than "thoughts?".
- Send context first: the plan, the invariant, the evidence pack, and the
  question you are least sure about.
- Time-box it. Offer 30 minutes and send the material a day ahead.
- Record the disagreement, not only the agreement. If you did not take the
  advice, say why in the journal.
- Good reviewers: a senior colleague, a mentor community, an open-source
  maintainer in exchange for your review of their work. Review swaps with a
  peer on the same programme work from Mission 13 onward.

### Journal

One file per mission, `upskilling/journal/NNN-mNN-slug.md`, continuing the
numbering already in that folder. Template:

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
Links to tests, measurements (with N and machine), transcripts, PRs.
What would convince me I was wrong?

## Scope
What I cut, when, and why. Or why nothing needed cutting.

## What I'd do differently
One process change and one technical change. Not "be more careful".

## Review log
Who or what reviewed it, what they found, what I accepted or rejected, with reasons.
```

Write it on the day, not at the end of the mission. Entries that say "I was
wrong about X" are the valuable ones.

### How to know you are done

1. **Coverage.** Every dimension has at least two missions scored 4, and no
   dimension is below 3 on its most recent mission.
2. **Independence test.** Pick a problem in this repo that no mission covers
   ("streak logic when the laptop changes time zone", "export and import of
   progress between machines"). Deliver a design doc and a first PR with no
   mission card, and have it reviewed. The reviewer should not be able to tell
   it was unplanned.
3. **Teach-back.** Your Mission 20 lessons pass `npm run verify`, and a peer who
   works through one learns something they did not know.
4. **Review calibration.** On a fresh Mission 19 planted-bug exercise, you catch
   at least two of three in under 45 minutes and your comments need no
   rewording before sending.
5. **Estimate calibration.** Your second Mission 21 median ratio is inside
   0.7–1.5, or you can explain exactly why not.
6. **Artifacts a hiring manager could read.** ADRs, postmortems, a threat model,
   a runbook, a design doc and a scope-cut note, each standing on its own.

If one is missing, the programme is not finished, whatever the mission count
says.

---

## 4. Reading list, keyed to missions

All are real, published, and easy to find. Read the relevant section during the
mission, not everything up front.

| Missions | Reading | Why |
| --- | --- | --- |
| 01, 09, 11 | Brendan Gregg, *Systems Performance* (2nd ed., 2020), the methodology and USE-method chapters | Measure before you guess |
| 01, 07, 11 | Gil Tene, "How NOT to Measure Latency" (talk, widely recorded) | Percentiles, coordinated omission, why averages lie |
| 02, 10 | Vladimir Khorikov, *Unit Testing Principles, Practices, and Patterns* (Manning, 2020) | What makes a test valuable |
| 02, 04 | David J. Agans, *Debugging: The 9 Indispensable Rules* | The method behind the eleven bugs in journal 001 |
| 02, 10 | Jez Humble and David Farley, *Continuous Delivery* | Pipelines and test isolation |
| 02 | Nicole Forsgren, Jez Humble, Gene Kim, *Accelerate* | Why fast, reliable pipelines matter, with evidence |
| 03 | React docs: "Synchronizing with Effects" and "You Might Not Need an Effect" | The canonical form of the client-side race |
| 03 | Brandur Leach, "Implementing Stripe-like Idempotency Keys in Postgres" (brandur.org) | Idempotency as a design tool |
| 03, 16 | Martin Kleppmann, *Designing Data-Intensive Applications*, ch. 7 (Transactions) | Isolation levels, lost updates |
| 04 | Google, *Site Reliability Engineering*, "Postmortem Culture: Learning from Failure" | The format |
| 04 | John Allspaw, "Blameless PostMortems and a Just Culture" (Etsy Code as Craft, 2012) | Why blame hides causes |
| 05 | Pillai et al., "All File Systems Are Not Created Equal" (OSDI 2014) | Why `rename` alone is not durability |
| 05 | Dan Luu, "Files are hard" (danluu.com) | A readable summary of the above |
| 05, 09 | Michael T. Nygard, *Release It!* (2nd ed.) | Timeouts, bulkheads, backpressure, shutdown |
| 06 | Express docs, "Error handling"; the Express 5 migration guide | Async errors in 4 versus 5 |
| 06, 14 | RFC 9457, *Problem Details for HTTP APIs* | A standard error envelope |
| 07 | Google, *Site Reliability Engineering*, "Monitoring Distributed Systems" and "Service Level Objectives" | Which signals, and SLOs |
| 07 | Charity Majors, Liz Fong-Jones, George Miranda, *Observability Engineering* (O'Reilly, 2022) | Structured events over log lines |
| 08 | Adam Shostack, *Threat Modeling: Designing for Security* | STRIDE and trust boundaries |
| 08 | OWASP Cheat Sheet Series: XSS Prevention, Node.js Security | Concrete defences |
| 08 | Node.js docs: "Permission Model"; `node:vm` ("not a security mechanism"); `worker_threads` | What isolation Node does and does not give you |
| 09 | Mor Harchol-Balter, *Performance Modeling and Design of Computer Systems: Queueing Theory in Action* (2013), the Little's Law chapter | Queueing intuition for admission control |
| 10 | Martin Fowler, "Eradicating Non-Determinism in Tests" (martinfowler.com, 2011) | Root causes of flakiness |
| 10 | Google Testing Blog, "Flaky Tests at Google and How We Mitigate Them" (2016) | Flake budgets at scale |
| 12 | web.dev, "Reduce JavaScript payloads with code splitting"; React docs for `lazy` and `<Profiler>`; Vite docs, "Building for Production" | The tools, if the numbers say to use them |
| 13 | Michael Feathers, *Working Effectively with Legacy Code* | Characterization tests, seams |
| 13 | Martin Fowler, *Refactoring* (2nd ed.) | Small behaviour-preserving steps |
| 13 | Kent Beck, *Tidy First?* (2023) | Structure changes separate from behaviour changes |
| 13, 14 | John Ousterhout, *A Philosophy of Software Design* | Deep modules, information hiding |
| 14, 18 | Titus Winters, Tom Manshreck, Hyrum Wright, *Software Engineering at Google*: "What is Software Engineering?" (Hyrum's Law), "Dependency Management", "Code Review" | Contracts you did not know you had |
| 14 | Semantic Versioning 2.0.0 | A compatibility vocabulary |
| 15 | Michael Nygard, "Documenting Architecture Decisions" (2011) | The ADR format |
| 16 | PostgreSQL docs, "Concurrency Control"; PGlite docs on filesystem persistence | Storage semantics for the migration |
| 16, 22 | Ryan Singer, *Shape Up* (Basecamp, free online): "Fixed time, variable scope" and "Decide when to stop" | Cutting scope on purpose |
| 17 | Yue Jia and Mark Harman, "An Analysis and Survey of the Development of Mutation Testing" (IEEE TSE, 2011); Stryker Mutator docs | Operators, equivalent mutants |
| 19 | Google Engineering Practices, "How to do a code review" and "The CL author's guide"; Conventional Comments (conventionalcomments.org) | Review as a skill with a standard |
| 20 | Greg Wilson, *Teaching Tech Together* (free online) | Designing a lesson backwards from what you will assess |
| 21 | Steve McConnell, *Software Estimation: Demystifying the Black Art* (2006), the chapters on calibration and ranges | Why ranges, and how to measure your own bias |
| 22 | Tanya Reilly, *The Staff Engineer's Path*; Will Larson, *Staff Engineer* | The direction beyond senior |
| 22 | Kleppmann, *DDIA*, ch. 1–2 and 5 | Capacity and data-model reasoning |
| all | Andrew Hunt and David Thomas, *The Pragmatic Programmer* (20th anniversary ed.) | The general habits |

Dropped from the draft: Schell's *The Art of Game Design* and Koster's *A Theory of Fun*,
because the game-economy simulation mission was cut; and the attribution of
Little's Law to DDIA chapter 1, which discusses latency percentiles but is not
where you would learn the law.

---

## Appendix: defects the missions are built on

Every entry was re-verified on 2026-09-23 by reading the cited lines at commit
`5def3f9`. Items marked *reported* rest on the draft author's runs and should
be reproduced before you rely on them. Line numbers drift; the symbol names
will not. While this was being written, an uncommitted rewrite of `web/src/`
appeared in the working tree (new `web/src/pages/lesson/`, an `ApiError` class,
a `mutation` kind in the UI, and an `ignore` flag in `LessonView`). Entries
17, 18 and 19 describe the committed tree; run `git status` and re-check them
before starting Missions 03, 12 and 14.

| # | Where | Defect | Mission |
| --- | --- | --- | --- |
| 1 | `server/index.ts:338` vs `:346` | `alreadyPassed` read before `await runExercise`; concurrent submits double-award XP, history and quests | 03 |
| 2 | `server/progress.ts:82–84` | Any `load()` error, including a parse failure, returns `fresh()`; the next `save()` overwrites the file | 05 |
| 3 | `server/progress.ts:89–101`, `:77`, `:56` | `save()` swallows errors after the response is sent; no `fsync`; shallow merge loses nested defaults; `version` written and never read | 05 |
| 4 | `server/index.ts`, all async routes | Express 4 does not forward async rejections; Node 15+ exits on an unhandled one. Reachable paths are narrow today (`mkdir` in `runExercise`); the next handler will widen them | 06 |
| 5 | `server/index.ts:281–329`, `:265` | `/hint`, `/solution`, `/run` and `GET /lesson/:id` skip `lessonUnlocked`; only `/submit` (line 335) checks it | 06 |
| 6 | `server/index.ts:256`, `:262` | `GET /state` rolls the quest board, syncs quests, and saves | 14 |
| 7 | `server/runner/worker.mjs:547`; `runner/index.ts:114–119` | Learner code shares the thread with `parentPort`; the parent accepts the first non-progress message as the verdict (*forgery reported confirmed*) | 08 |
| 8 | `server/runner/worker.mjs:292`, `:547`, `:556`, `:586` | Harness globals assigned before learner import; spec imported after; `ok` computed with `Array.prototype.every` (*tampering reported confirmed*) | 08 |
| 9 | `server/runner/index.ts:82–83` | Comment says learner code cannot read the save file; `env:` only replaces `process.env`, and a worker thread shares the process | 08 |
| 10 | `server/index.ts:439` | `app.listen(PORT)` binds all interfaces; no `Host`/`Origin` check | 08 |
| 11 | `server/runner/index.ts:67`, `:73`, `:84` | No concurrency cap; timeout is wall-clock from before spawn; 512 MB per worker (*6.8 s trivial run and 10 s timeouts reported under load*) | 09, 11 |
| 12 | `server/runner/worker.mjs:13`, `:40`, `:50` | `typescript` imported eagerly for every kind; logs capped by count, not bytes | 09, 11 |
| 13 | `scripts/smoke.ts:119–120` | Only the expected-pass cases are asserted; the fail, timeout and compile-phase cases can regress silently. (`scripts/e2e.ts:80,86` assert them, but e2e is manual) | 02 |
| 14 | `scripts/verify-content.ts:163–205` | Up to 124 grading runs (62 code lessons × reference + starter) executed serially. The draft said 144; quizzes are skipped at line 171 | 10 |
| 15 | `scripts/e2e.ts:38`; `server/progress.ts:11` | e2e resets the real save file; `DATA_DIR` is not configurable | 02 |
| 16 | `scripts/ui-smoke.mjs:9`; `package.json` | Imports `esbuild`, which is not declared; present only transitively via Vite | 02 |
| 17 | `web/src/pages/Lesson.tsx:14–18`, `:226` | Lesson fetch effect has no cancellation; Reset does not save a draft, and `server/content.ts:102` prefers the draft on reload | 03 |
| 18 | `web/src/api.ts:3`, `:64`, `:98` | Hand-mirrored types; `LessonKind` is a separate union; `Quest` lacks `metric`/`kind`; `days` lacks four fields | 14 |
| 19 | `web/src/pages/Lesson.tsx:2–5`; `web/src/App.tsx:5`; `dist/assets/` | CodeMirror in the initial chunk; 740,795 B single chunk (verified on disk) | 12 |
| 20 | `web/src/components/bits.tsx:10–13` | Unsanitised `marked` → `dangerouslySetInnerHTML`, justified by a comment that assumes first-party content | 08, 15 |
| 21 | `server/index.ts:57–58`; `server/gamify.ts:25` | `nextRankFor` hard-codes rank thresholds duplicated from the private `RANKS` | 13 |
| 22 | `server/gamify.ts:12`, `:25–34`, `:219–271`; `content/` | Base XP 6,785 + achievements 5,085 = 11,870; level 22 needs 12,600; 100% with no bonuses is level 21 "Mid III". Naming: "Mid-Level" achievement, "Senior-Track" top rank (all arithmetic verified) | 15 |
| 23 | `server/content.ts:25`, `:62`; `server/gamify.ts:220–227` | Lesson ids are persisted keys with no rename or retire story; orphaned records still count for achievements; unlock depends on the previous id | 14 |
| 24 | `server/runner/index.ts:19`, `:144` | `cleanupRunDir` is fire-and-forget and `sweepRunsDir` swallows failures, so locked files leave debris (*reported*); the sweep also deletes other processes' in-flight runs (Review 05, F1) | 05 |
| 25 | `package.json` `test`; `scripts/lint-content.mjs:20` | `npm test` runs `lint:content` without `--check`, so a test run can rewrite source files | 04 |
| 26 | `server/index.ts:281–288` | The draft claimed `/hint` had a milder race. It does not: there is no `await` between reading and incrementing `hintsUsed`. Kept here as a reminder to verify inherited claims | 03 |

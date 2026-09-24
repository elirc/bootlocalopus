# v2 plan — synthesis of the adversarial reviews

*Written 2026-09-24 by the orchestrating reviewer, after all six review pairs
were in. This is the document the builders work from. Where a first-pass
(Opus) recommendation was rejected or changed by the adversarial pass (Fable),
the reason is recorded, because the disagreement is the part worth learning
from.*

## How this was produced

Six areas. For each, one model reviewed the committed code (`5def3f9`) and
wrote findings; a second model was then briefed to *attack* that review —
verify every claim against the code, reproduce the important ones, find what
was missed, and produce an executable list. The pairs are in this folder as
`0N-<area>-opus.md` / `0N-<area>-fable.md`.

Three patterns showed up in every pair, and they are the reason the second
pass exists:

1. **Facts held, proportion did not.** Almost every load-bearing bug the first
   pass reported was real (double payout, forged passes, `AbortSignal` in
   workers, the 194-file typecheck program). Almost every *plan* was too big:
   a 25-file server split for 450 lines, a 30-file frontend split for 1.7k,
   a per-lesson `lesson.ts` loader that would have made startup 4–20× slower.
2. **Claims cited as measured were sometimes placeholders.** One report's
   "surviving mutants found" section contained the literal text
   `MUTATION_RESULTS`. One appendix defect (a "milder race" in `/hint`) does
   not exist. The adversary's job was to check, and it did.
3. **The worst bugs were in the interaction between areas.** Draft autosave
   marking lessons "attempted" and hijacking the Continue button; the runner
   charging PGlite's boot to the learner's timeout; `sweepRunsDir` deleting a
   sibling process's live runs under `tsx watch`. No single-area reviewer
   would have owned any of these.

## Decisions

### Sandbox (`01-*`)

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| Trust boundary | Parent treats the worker as untrusted data: private `MessageChannel` for results, verdict recomputed from rows, `execArgv: []`, locked harness globals, captured primordials, import policy denying `worker_threads`/`vm`/`child_process`/`module` | "Results on a private channel" as a *sufficient* fix | A learner controls the worker's globals; the channel only matters together with the parent deriving `ok` itself. Both were kept. |
| Equality | A specified 8-rule `toEqual` (tags must match, cycles, Date/RegExp/Error/Map/Set/iterables, `undefined`-key-insensitive, an opaque-instance guard) plus `toStrictEqual` = `util.isDeepStrictEqual` | Replace `toEqual` with `util.isDeepStrictEqual` outright | Strict treats `{a: undefined}` ≠ `{}`; lesson authors want `toEqual` loose on that and strict on *type*. Fifteen false positives (Map vs `{}`, two different Errors, two URLs…) were reproduced against the old code. |
| Budgets | Boot budget (60 s, never scored) separate from the test budget, armed on a `ready` message sent after env setup | Single budget from spawn | Under load, correct submissions were timing out during PGlite/tsc boot and being recorded as failed attempts. |
| Structure | Split into ~10 plain `.mjs` modules after the parent-side fixes | Keep one 600-line file | Proportionate now that the file has three environments and a mutation mode. |
| Mutation kind | Sequential in one worker: fresh harness per implementation, opaque keys, correct implementation at a random index, `equivalents` that must also pass | One worker per mutant | A mutant in an infinite loop is handled by per-test timeouts; N workers cost N boots for no isolation gain. |
| Performance | Trim the typecheck program (`types: []`, one `lib`) — 194 files → 59; persistent typecheck worker later | Warm worker pool for JS kinds | Never reuse a worker that has run learner code. |

### Server and economy (`02-*`)

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| Reward for care | `+20%` clean bonus (no hints, no reveal); first-try bonus and combo deleted | Hidden tests on Submit; "Run costs a little" | Hidden tests cost 62 lessons of authoring and are a trap UX; a free Run is the pedagogical point. The combo rewarded guessing on Run before submitting. |
| Hint pricing | `base × 0.5 / hintCount` per hint; all hints together always cost half | Flat 12%/hint floored at 50% | Flat pricing made hints after the 4th free. |
| Rank | From completion milestones (fraction, bosses, per-track coverage); "Senior-Track" deleted; "Mid-Level" at 100% | Rank from XP; rank from a "skill model" | Meta XP (badges + quests, 5,085) exceeded the curriculum (6,785), so learners reached "Senior-Track" halfway. No skill model exists to rank from. |
| Meta XP | Achievements rescaled to 1,420 total; quests 15–50 XP and only drawn when feasible | Keep the old table | 100% completion now lands at L18–L21 with a curve that is a progress bar, not a promotion. |
| Persistence | JSON stays. ENOENT → fresh; any other read error → quarantine + newest backup; fsync-then-rename with retries; daily backups (keep 14); pre-reset backup; `DATA_DIR`; lock file; `version` + migration | Move progress to PGlite | A WASM boot and a binary directory break the "copy it to a USB stick" promise for no durability gain a careful JSON path cannot match. |
| Concurrency | Global grading semaphore of 1; per-lesson `409`; the record is read *after* the `await` | Per-lesson locks only | A single learner never needs two graders; parallel workers only add boot contention. |
| Unscored failures | `scored` flag: a boot timeout, worker crash or grader bug is not an attempt and does not reset anything | Treat every failure alike | Two of four correct sequential submits were logged as failures on a loaded box. |
| Unlock rule | "All but one" at both levels: a chapter opens when ≤1 lesson of the previous is unpassed; a lesson opens when ≤1 before it is unpassed | The 70% rule + strict one-at-a-time | The old pair meant only a chapter's *last* lesson could ever be skipped, and a 3-lesson chapter needed 100%. |
| Structure | Four files: `app.ts` (`createApp({ store, runner, now })`), `rewards.ts`, `projections.ts`, `index.ts` | 25-file routes/services/repositories tree | 450 lines. |
| Types | Server `import type`s the wire types from `web/src/api.ts` and annotates responses | A new `shared/` package | Server and web are already one `tsc` program. |

### Frontend (`03-*`)

Implemented as the adversary's 24-item list, with one reversal: the reward
card uses a native `<dialog>` (focus in, Escape closes, backdrop click does
*not* dismiss) rather than a bespoke overlay. Lazy-loading CodeMirror was
rejected — the dashboard's primary action leads straight to an editor, and
the asset is hash-cached on localhost. `Lesson.tsx` is split into four files;
no `features/` or `hooks/` directories. `Ctrl/Cmd+Enter` now *runs* (free)
and `Ctrl/Cmd+Shift+Enter` submits, bound inside CodeMirror at top precedence
so it stops inserting a blank line. Reset and Solution no longer destroy the
learner's code. The rewrite itself was then reviewed by a fresh adversary
(`07-frontend-rewrite-fable.md`).

### Curriculum (`04-*`)

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| New track | **Testing & Quality** (7 lessons, weight 1.2): 5 `mutation` lessons where the learner writes the tests, 1 quiz, 1 boss | Fold testing into other tracks | "Can this person write a test that fails for the right reason" is the single most reliable junior→mid signal. |
| New kinds | `mutation` and `node-db` | `review` (diff-flagging UI), `project` (multi-file staged) | `review` is 80% achievable as a multi-select quiz over a diff; `project` needs a new editor, runner and progress model. A capstone *chapter* of ordinary lessons captures it. |
| Volume | 30 new lessons (list in `04-curriculum-fable.md` §4), in the order: mutation infra → pure-JS mutation lessons → `node-db` → security → production Node → React → SQL → TS/JS → the diff quiz → the remaining mutation lessons | The "must add 35" | Cut: job queue, outbox, RLS, worker threads, child_process, realtime/evolution/deployability quizzes, Intl duplicate, FTS. Promoted: JSONB, EXPLAIN. |
| Existing content | Fix the defects the adversary reproduced: `node-crud-boss` ordering vs the frozen clock, `sql-upsert` comment handling, `ts-runtime-validator` prototype keys, unstable effect deps in two React references, a UTF-8 split in `node-streams`, window-function ties, wall-clock flakes | — | Each was proven with a probe through the real runner. |
| Progression extras | Prerequisite DAG, tag-based paths, spaced refresh, placement quizzes | — | All "later" or "never": each changes the product's promise; the catalogue should reach its new size first. |

### Tooling (`05-*`)

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| Content format | One folder per lesson (`brief.md`, `starter.*`, `solution.*`, `tests.*`, `fixtures.sql`) with **typed metadata per chapter** in `chapter.ts`, a sync loader with strict validation, and a migration proven by round-trip | Keep template literals + a `code` tag; per-lesson `lesson.ts` | Three real escaping bugs shipped; agents editing template literals with string tools produce more. Per-lesson dynamic imports were measured at 4–20× the startup cost. |
| Content linter | Deleted | Keep with `--check` | It rewrote *valid* TypeScript (`` `x`.trim() ``); a tool whose rule cannot be stated soundly must not rewrite. |
| Verify | Parallel (N = `clamp(1, min(cores−2, freemem/700MB), 4)`), ×3 budgets when parallel, one serial retry with FLAKY/SLOW labels, `--changed` from `git diff`, a timed-out or grader-phase starter is a content error | Serial with learner budgets | Verification correctness matters more than its speed, and learner budgets on a loaded box produced false failures. |
| Mutation check on content | Minimal: four operators, survivors reported, timeouts never counted as kills | The first pass's design | It counted timeouts as kills and its evidence section was a placeholder. |
| Hermetic suites | `test:api` and `test:ui` start their own server on a random port with a scratch `DATA_DIR` | Documented "server must be running" | `test:api` was resetting the learner's real save; `test:ui` failed on a fresh checkout. |
| CI | GitHub Actions, Node 24, `npm ci`, `npm test`, then e2e + ui with self-started servers; `.githooks/pre-commit` via `core.hooksPath` with the executable bit committed | husky | No dependency needed. |

### Roadmap (`06-*`, `ROADMAP.md`)

26 draft missions became 22 after merging duplicates and cutting mid-level
busywork; effort re-estimated at 265–380 h including planning and journal
overhead (8–11 months at 8 h/week, 13–18 at a realistic 6). Four missions
added: ADR write-and-defend, estimate calibration across missions, teaching
(write a lesson *and* its adversarial review), and a mandatory mid-mission
scope-cut note.

## Build assignment

| Wave | Owner | Scope | Gate |
| --- | --- | --- | --- |
| 1 | Opus A | `server/runner/**`, `scripts/smoke.ts` — sandbox MUST/SHOULD list, `node-db`, `mutation` | e2e + verify + smoke green |
| 1 | Opus B | `content/**` migration with round-trip proof, `AUTHORING.md`, defect fixes | round-trip diff empty; verify green |
| 1 | Fable | Review of the frontend rewrite (`07-*`) | — |
| 2 | Opus C | `scripts/**` tooling: parallel verify, `--changed`, hermetic `test:ui`, CI, hooks, package hygiene | after B |
| 2 | Opus D1–D5 | New lessons, one agent per chapter group, disjoint files | after B (D1/D2 also after A) |
| 3 | Fable | Review of every new chapter (brief precision vs tests, hint leakage, XP) | after D |
| 3 | Orchestrator | README, journal entries, final verification, commit | last |

## What was consciously not done

- No React 19 upgrade (three lessons' prose and the RTL setup change).
- No warm worker pool; no persistent typecheck worker yet.
- No option shuffling in quizzes; no spaced repetition.
- No `review` or `project` lesson kinds.
- No move off the JSON save file.

Each of these is a mission in `ROADMAP.md`, which is where they belong.

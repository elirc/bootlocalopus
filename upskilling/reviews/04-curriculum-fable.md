# bootlocalopus curriculum review (04, fable) — adversarial pass over the Opus review

Stance: I was asked to attack `04-curriculum-opus.md`. I read `README.md`, `content/AUTHORING.md`, all six `content/*/index.ts` files in full (brief, starter, hints, solution, tests for every lesson Opus criticises), `server/runner/worker.mjs`, `server/runner/index.ts`, `server/content.ts`, the quiz-grading path in `server/index.ts`, and the installed package versions. I then ran 22 probes through the real sandbox (`runExercise`) with deliberately wrong or modified solutions. Probe code lives in my scratchpad only; no project file was changed. Items marked **[probed]** are things I watched happen; items marked **[reasoned]** are conclusions from reading the code that did not need a run.

Environment note that matters for the builder: the machine was shared with another heavy job during this review (a foreign `node` process at 1.7 GB / 95 s CPU). Under that load, every sandbox run hit its budget (10 s node, 20 s react/typecheck, 25 s sql) and returned the learner-blaming message "Timed out … An infinite loop, an await that never settles…" with zero tests registered. I had to re-run probes with a 150 s budget to get results. That is a finding in itself (section 6, M1).

---

## 1. Reliability verdict on the Opus review

**Mostly reliable on the defects; over-confident on a few characterisations; inflated on the "must add" list.**

- Of the 14 defects Opus marked **[verified]**, I re-verified 13 by probe or by direct reading and found them correct. One is false: the "`ADD COLUMN … DEFAULT` hangs the sandbox" claim (F2) does not reproduce — the modern one-liner passes `sql-migration` 13/13 in 7.4 s. Opus's two 30 s timeouts were almost certainly the same load artefact I hit, and the learner-blaming timeout message (section 6, M1) is the real bug behind it.
- Opus is right about the big four: `js-map-limit` batching passes, `react-memo-renders`' `useMemo` is decorative, `sql-windows` running totals are wrong on ties, and `sql-migration` teaches a locking migration under a "does not lock" title. Those alone justify a Phase 0.
- Where Opus is weaker: (a) it labels some *stated* design decisions as defects (`js-this-binding`, `js-event-emitter`, `js-error-classes`, `sql-upsert`); (b) it calls `craft-refactor` an unsignposted behaviour change when the brief and hint 1 both spell out the new config key — the real problem there is a contradictory framing sentence, which is a one-line fix; (c) one factual claim is simply wrong (`js-error-classes` quadruple backticks "render oddly" — they render as ordinary `<code>` through `marked`, checked); (d) the platform premise is slightly off: TypeScript installed is **5.9.3**, not 5.6, which makes the inferred-type-predicate point *stronger*, not weaker.
- The "must add 35" is padded. About 10 of the 35 are senior/infra/niche for a junior→mid target on this stack (job queue, outbox, RLS, SSE-adjacent realtime quiz, worker threads, capstone-as-new-kind). My cut is in section 4.
- Opus missed at least seven concrete lesson-level defects (section 6), including two that make a **correct** learner answer fail (`node-crud-boss` sort order, `sql-upsert` starter comment) and one reference-solution correctness hole (`ts-runtime-validator` accepts prototype-named keys).

### Concurrent edits, noted at hand-off

While this review was running, another agent began editing the project (18 modified files, uncommitted, none touched by me). The six `content/*/index.ts` track files are untouched, so every per-lesson verdict below stands. Four structural items in section 5 are already landing in that work and are marked **(landing)**: the quiz-explanation leak is closed in `server/app.ts` (`gradeQuiz` no longer returns `explain`); `server/runner/index.ts` now has a `ready` handshake so a worker that never finished booting is reported `ready: false` and "must not be scored"; `server/content.ts` replaces the 70 % rule with "all but one" at both chapter and lesson level; `content/types.ts` adds `kind: 'mutation'` with `subject` and `mutants: { label, code }[]`. The worker has no `mutation` branch yet, and the type has no `equivalents` field — section 4 explains why equivalents matter (they are what stop `test-rtl-behaviour` from rewarding `querySelector('.btn')` tests). Re-check M1 against the new runner before acting on it.

---

## 2. Per-lesson verdicts

Legend: **AGREE** = Opus is right, my reason given. **PARTLY** = right in substance, wrong in degree or framing. **DISAGREE** = evidence against.

### JavaScript

| Lesson | Opus claim | Verdict | Evidence / reason |
|---|---|---|---|
| `js-map-limit` | Batching passes all 7 tests; hint 1 lies | **AGREE [probed]** | Chunk-and-`Promise.all` implementation: 7/7 pass. Durations `[120,5×7]`, limit 2: batching = 120+5+5+5 = 135 ms < 200. Fix as Opus says: assert start order (task 3 starts before the 120 ms task finishes) — that is load-independent, unlike a tighter wall-clock threshold. |
| `js-task-queue` | Same weakness in "keeps the pool busy" | **PARTLY [reasoned]** | Same arithmetic (`[120,5×6]`, concurrency 2 → 135 ms), so the test proves nothing. But a `TaskQueue` whose `push` returns per-task promises is structurally awkward to batch; the realistic wrong implementation (awaiting inside `#drain`) is caught by "respects the concurrency limit" + FIFO + size/running tests. Low risk; rename the test or add a start-order assertion. |
| `js-promise-parallel` | Hint 3 walks into the sync-throw failure; `<100 ms` flakes | **AGREE [probed, both]** | `ids.map((id) => loadOne(id).then(...))`: 7/9 — "handles a loader that throws synchronously" fails with the raw `sync throw` escaping `map`, **and "overlaps the work" failed with `expected 186 < 100`** on the loaded machine, which is the flake Opus predicted, observed. The brief never mentions sync throws. The reference's `Promise.resolve().then(() => loadOne(id))` is the trick and it is in neither brief nor hint. Wall-clock `< 100 ms`: agree; drop it, `peak === 5` already proves overlap. |
| `js-retry-backoff` | Jitter promised not taught; sleep not abortable; mid-wait test accepts any error | **AGREE [reasoned]** | `why` mentions jitter, nothing else does. Reference checks `signal.aborted` only after `sleep` returns; the test's injected sleep aborts synchronously so it cannot see the difference. `.rejects.toThrow()` with no matcher. All three real. Suggested fix: `timers/promises` `setTimeout(ms, undefined, { signal })` and assert the rejection reason is `signal.reason`. |
| `js-resilient-client` | Hint 5 produces `[0,1]`, test wants `[1,2]` | **AGREE [probed]** | Followed hint 5 literally (`backoff(attempt)` in a 0-based loop): 14/15, failing exactly "awaits backoff … with the attempt number: expected [0,1] to equal [1,2]". Brief must say "attempt is 1 for the first retry". |
| `js-this-binding` | Arrow field is a "shape change"; instance test passes on starter | **PARTLY / DISAGREE** | The wording nit is fair ("you may convert a method to a bound field"). But "keeps items per instance" passing on the starter is not a defect: the brief forbids moving `items` to a global and that test is the guard. A guard test that passes on the starter is normal. |
| `js-event-emitter` | Unsub-during-emit semantics unstated; added-during-emit untested | **DISAGREE / AGREE** | Brief rule 2: "must not skip or double-call anyone — iterate over a snapshot". That *is* the statement that `b` still runs. Adding a test that a handler subscribed during emit is not called in that emit: agree, cheap and good. |
| `js-event-loop` | Strawman distractors; `setImmediate` nuance | **PARTLY** | Q3's explanation ("does not reliably beat a 0 ms timer") is correct for the main-module case the question implies. One sentence about the I/O-callback case would be nice. "They are dropped" as a distractor is weak, agreed. |
| `js-group-index` | No `Object.groupBy`; `__proto__` hazard | **AGREE (low)** | `Object.groupBy`/`Map.groupBy` are in Node 21+; this runs on Node 24. A `"__proto__"` key with the reference crashes (`Object.prototype.push is not a function`) rather than pollutes, but the point stands; hint 2 already offers `Object.create(null)` — make it the default. |
| `js-once-memoize` | Cached rejected promise not covered | **AGREE (low)** | Real and the most common production bug in `memoize`. Belongs in the single-flight cache lesson (section 4, #18) rather than here. |
| `js-error-classes` | `isRetryable` treats missing status as retryable; quadruple backticks render oddly | **PARTLY / DISAGREE** | The brief states "true for status ≥ 500 **or a missing status**" and the test is named "network-level"; it is a stated decision, worth one sentence of justification, not a defect. The backticks render as `<code>` in `marked` (checked). |

### TypeScript

| Lesson | Opus claim | Verdict | Evidence / reason |
|---|---|---|---|
| `ts-runtime-validator`, `ts-result` | `kind: 'ts'` but no types anywhere | **AGREE** | Confirmed by reading: starters, solutions and tests contain zero type annotations. `Infer<typeof schema>` is exactly the missing skill. Also see section 6, M3 for a reference bug in the validator. |
| `ts-typed-emitter` | 210 XP for six lines; hints hand over the answer | **PARTLY** | Hints 1, 2, 4 do give `HandlerOf`, `emit` and `EventsWithoutPayload` verbatim. But the spec is the strongest in the track (12 `@ts-expect-error` lines, generic-over-any-map check) and variadic tuple spreading is a real skill. 210 is wrong; 110–120 is right. Making it `class TypedEmitter<E> implements …` over the JS emitter would justify boss XP. |
| `ts-satisfies` | `satisfies` is not graded | **AGREE [probed]** | Reference with ` satisfies Record<…>` deleted: **2/2 pass**. The checked value lives in `solution.ts`; a spec file cannot observe whether `satisfies` was written. Only `as const` is load-bearing for the spec. Opus's `defineRoles<const T extends …>(roles: T): T` rewrite is gradable (a call with a malformed role becomes an `@ts-expect-error` line, and dropping `const` makes `typeof ROLES.admin.level` widen to `number` and fail `Equal<…, 3>`). |
| `ts-generics` | Stray authoring note; hints recommend `as` after `ts-narrowing` bans it | **AGREE** | "must reject keys whose value is not comparable? No: keep it simple" is in the shipped brief. The `as`-inside-a-builder vs `as`-at-a-boundary distinction is a good one-liner to add. |
| `ts-narrowing` | "No `as`" unenforceable; `_nums` asserts the stdlib; TS ≥ 5.5 infers predicates | **AGREE [probed]** | Ran the **starter** through the real `tsc`: only two diagnostics — spec:17 (`isNonNull` result not `string[]`) and spec:25 (`payload` still `unknown`). **No error for `isString`**, and the reference with `isString`'s `: value is string` annotation deleted passes **2/2**: the unannotated `typeof value === 'string'` already narrows under the installed TS 5.9.3. The brief's first bullet is therefore already satisfied by the starter. Rewrite around when inference works and when you must annotate (generic and `in`-based guards). |
| `ts-conditional` | Underpriced at 80 | **AGREE** | Six utilities plus the distribution trap for 80 vs 210 for the emitter. |

### React

| Lesson | Opus claim | Verdict | Evidence / reason |
|---|---|---|---|
| `react-memo-renders` | Removing `useMemo` passes everything | **AGREE [probed]** | Reference with `useMemo` replaced by a plain `filter`: **8/8 pass**. `visible` is never a prop of a memoised child, and the row's `item` objects keep identity regardless. The lesson currently teaches the cargo cult it names. Fix: pass `visible` into a memoised `<Summary rows={visible}>` that logs renders. |
| `react-keys-debug` | Hint 1 gives it away; source grep is vacuous | **AGREE [probed]** | Starter run: 3/6 — the three behavioural tests fail, and **"does not key by index" passes on the buggy starter** because compiled JSX is `key: index`. Hint 1 literally says `key={todo.id}`. 75 XP for that is too much. |
| `react-reducer-cart` | Brief omits `Remove <name>` and `Clear` | **AGREE** | Tests click `Remove Widget` and `Clear`; neither string is in the brief. Learners cannot see tests. Float dollars: agree it contradicts the SQL track, low priority. |
| `react-derived-state` | First-render test cannot fail; `toString` grep is fragile | **AGREE [probed]** | Effect-synced `itemCount` version: 6/7 — only "holds no state at all" (the `toString` grep) fails; "shows the count on the very first render" **passes** because RTL's `render` flushes effects inside `act`. A learner who leaves a comment containing `useState` fails a correct solution. Use a commit counter (`React.Profiler onRender`). |
| `react-custom-hooks`, `react-effect-fetch` | React 18 removed the unmount warning; those tests are vacuous | **AGREE [probed]** | `useDebouncedValue` with **no cleanup at all**: 14/14 pass. For `react-effect-fetch` the vacuous test is redundant rather than harmful — "aborts on cleanup" and "ignores a stale response" still catch a missing cleanup. For `react-custom-hooks` there is no other cleanup test, so the lesson's stated requirement is ungraded. |
| `react-controlled-form` | "One state object" test passes with two `useState`s; disabled-submit a11y | **AGREE [probed]** | Two independent `useState`s: **8/8 pass**. The test only checks that changing one field does not clear the other. (Side note: "prevents the default form submission" dispatches a raw `Event` outside `act`, producing act() warnings in the logs — harmless, but noisy for the learner.) A11y point is fair as a sentence in the brief, not a grader change. |
| `react-compound-tabs` | Hint 4 wrong about screen readers; APG keyboard missing | **AGREE / PARTLY** | `display:none`/`hidden` content is excluded from the accessibility tree; hint 4 is wrong. Keyboard/`aria-controls`: agree it is non-conformant, but it is a *context* lesson; the conformant widget belongs in the combobox lesson (section 4, #29). Fix the hint, add one honest sentence. |
| `react-a11y-modal` | No focus trap/`inert`/`<dialog>`; `onClose` in deps bounces focus | **AGREE** | Both real. The deps issue is a genuine reference bug: any parent re-render with an inline `onClose` runs cleanup (focus → trigger) then re-focuses the dialog root, yanking focus off whatever the user had tabbed to. The harness survives only because `Harness` re-renders solely on open/close. "Portfolio-grade" overclaims. |
| `react-render-props` | `load` in deps → infinite refetch with an inline prop; padding | **AGREE** | `List`/`Toggle` are trivial; `Resource` duplicates `react-effect-fetch`. Weakest React lesson; 80 XP is generous. |

### Node

| Lesson | Opus claim | Verdict | Evidence / reason |
|---|---|---|---|
| `node-streams` | Per-chunk `toString('utf8')` corrupts split multibyte; `.pipe()` swallows source errors | **AGREE [probed]** | Fed `{"name":"café"}\n` split inside the `é`: reference emitted **`{"name":"caf��"}`**. `buffer += chunk.toString('utf8')` has no carry-over between chunks. `StringDecoder` or `setEncoding` is the fix. `.pipe()` not propagating a source error into `for await` is also true. Tags say "backpressure"; nothing exercises it. |
| `node-graceful-shutdown` | Phase-1 "503 everything" contestable; hint 6 outdated | **AGREE / PARTLY** | Hint 6: Node ≥ 19 `server.close()` already closes idle connections — outdated on Node 24, harmless. Phase 1: the brief conflates "fail readiness" with "fail traffic". Answering *all* new requests 503 during LB propagation is user-visible errors by design. Teach readiness-vs-traffic; the grader can keep the same shape with `/ready` → 503 and other routes still served. |
| `node-http-router` | Brief says `POST /users` → 405 and "anything else → 404"; test wants `DELETE /health` → 405 | **AGREE** | Verified in the brief table and the test "405s a wrong method on /health too". Only hint 4 states the general rule. Put the rule in the brief. |
| `node-signed-tokens` | Named `import { timingSafeEqual }` fails the spy test | **AGREE [probed]** | Reference with `import crypto, { timingSafeEqual } from 'node:crypto'`: **13/14**, failing only "uses a timing-safe comparison: expected 0 > 0". ESM named bindings of builtins are not re-synced when the CJS object is patched (needs `module.syncBuiltinESMExports()`). Either accept both styles in the test or say "use the default import" in the brief. `alg:none`/`jose` coda: nice-to-have. |
| `node-crud-boss` | `!==` token compare; retypes instead of composing; offset paging | **PARTLY** | `!==` two lessons after `timingSafeEqual`: agree, one line. "Should compose": design preference — retyping the plumbing in one file is also how take-homes are written; the real problem is section 6, M2 (the sort order), which Opus missed. Offset paging is fine for a notes API; the SQL track's argument is about scale. |
| `node-rate-limit` | Map never evicted; XFF/trust-proxy unmentioned | **AGREE (low)** | Both true; a sentence each. |
| `node-http-semantics` | Q3 meta-option; Q5 404-vs-403 nuance | **AGREE (low)** | "Both defensible, be consistent" as the only correct answer makes options 0 and 1 half-right. Reword to a single-answer scenario. |
| `node-error-envelope` | "Still logged" untested | **AGREE (low)** | Pass a `logger` in the options and assert it received the original. |

### Postgres

| Lesson | Opus claim | Verdict | Evidence / reason |
|---|---|---|---|
| `sql-migration` | Premise outdated since PG11; reference locks; harness rejects `CONCURRENTLY`; `ADD COLUMN … DEFAULT` hangs | **AGREE on content and `CONCURRENTLY` [probed]; DISAGREE on the hang [probed]** | Content: all correct — constant defaults are metadata-only since PG11; `SET NOT NULL` and `ADD CONSTRAINT CHECK` (no `NOT VALID`) take ACCESS EXCLUSIVE and scan; non-concurrent `CREATE UNIQUE INDEX` blocks writes. The title is false for the reference. `CONCURRENTLY`: every test errors with "CREATE INDEX CONCURRENTLY cannot run inside a transaction block" because the learner's SQL runs as one multi-statement `db.exec` (implicit transaction). **The hang does not reproduce**: the four-statement modern version (`add column plan text not null default 'free'`, named CHECK, `last_seen_at`, unique index) passed **13/13 in 7.4 s**. Opus's two 30 s timeouts look like the same machine-load artefact I hit (section 6, M1). Consequence Opus missed: the harness *already accepts* the one-liner the brief says "fails", so the lesson currently rewards ignoring its own premise. P5 still needs a `transactional: false` mode for `CONCURRENTLY`/`VALIDATE`. Reference runtime: 11 s uncontended vs a **25 s submit budget** — tight. |
| `sql-indexes` | "Smaller than the table" asserts the fixture; partial index never shown used; planner dependence; `DESC` hint | **AGREE / PARTLY** | The fixture-count test is vacuous, verified by reading. The partial index is never `EXPLAIN`ed: true. Planner dependence: PGlite is deterministic, so not *flaky*, but the "is used" tests are weak evidence on 10 rows; `set enable_seqscan = off` makes them honest. `DESC` misconception: agree. |
| `sql-n-plus-one` | Title promises app-level N+1; it is a JSON-aggregation lesson | **PARTLY** | Naming quibble with a real point behind it: batching (`= ANY($1)`/DataLoader) is the daily fix and appears nowhere. Keep the lesson, rename it, pair with `node-dataloader` (section 4, #15). |
| `sql-windows` | Hint 2 misdescribes the frame; ties give wrong running totals | **AGREE [probed]** | Inserted two same-day paid orders for Dara: reference produced running totals **`[1290, 1290, 1290]`** (expected `[990, 1090, 1290]`). Default frame is `RANGE … CURRENT ROW` including peers. Teach `ROWS BETWEEN` + unique tiebreak and add exactly this test. |
| `sql-normalise` | One company with two countries breaks the script | **PARTLY** | True and not in the fixture, so no learner is hurt today. Worth a "what if the spreadsheet is dirty" sentence or a second fixture row and a decision. |
| `sql-upsert` | Requiring `excluded` substring over-constrains | **PARTLY** | The brief instructs `excluded`, so it is signposted. The *actual* grader defect here is section 6, M4. |
| `sql-recursive-cte` | No cycle protection | **AGREE (low)** | A sentence on `CYCLE` / path arrays. |
| `sql-transactions` | Transactions in code appear nowhere | **AGREE** | Section 4, #14. |

### Craft

| Lesson | Opus claim | Verdict | Evidence / reason |
|---|---|---|---|
| `craft-refactor` | Tests demand a behaviour change; `toString` greps are brittle | **PARTLY [probed]** | A behaviour-preserving refactor (constant 5000, config key ignored): **21/22**, failing only `shippingCents(9999, {…, freeShippingThresholdCents: 10000}) → 499`. So Opus is right that a strict refactor fails. But the brief's task list *defines* `shippingCents(subtotal, config)` as honouring `config.freeShippingThresholdCents`, and hint 1 says "5000 is really `config.freeShippingThresholdCents` with a default". It is a contradiction with the sentence "behaviour stays identical", not a hidden test. One-line fix: "one deliberate extension: the threshold becomes configurable, default 5000". Greps: brittle but the reference keeps the constant at module level so the `'5000'` grep works; a learner writing `5000` in a comment fails. Agree the learner should write the characterisation tests (section 4, #2). |
| `craft-incident` | Telegraphed distractors; explanations leak; rollback-after-migration nuance | **AGREE** | Distractors like "Wait ten minutes" and "The on-call engineer was too slow" are not options a competent person picks. Leak confirmed in `gradeQuiz`: `error: passed ? undefined : question.explain`. 200 XP for a quiz whose second attempt is free is the worst-priced lesson in the app. |
| `craft-caching` | Q2 marks a definition as a mitigation | **AGREE** | "Select all the mitigations" with option 0 = the definition, marked correct. Malformed. |

### Cross-cutting

- **Source-grepping tests** (`react-derived-state`, `react-keys-debug`, `craft-refactor`, `sql-upsert`, `sql-keyset-pagination`): agree with Opus, and section 6 adds the worst instance.
- **Wall-clock assertions**: agree in principle; today's probes show that under load the *whole budget* fails before any single `< 200 ms` assertion gets a chance (section 6, M1).
- **XP**: agree `ts-typed-emitter` 210, `craft-incident` 200 and `react-keys-debug` 75 are overpriced; `ts-conditional` 80 and `node-request-body` 80 underpriced. README totals (6,785) and kind counts are internally consistent — I re-added them.

---

## 3. Factual-issue verdicts

| # | Opus claim | Verdict | Note |
|---|---|---|---|
| F1 | `sql-migration` premise outdated since PG11; reference locks; `CONCURRENTLY` rejected | **Correct** | PG11 fast defaults, PG12 skip-scan via validated CHECK, SHARE lock on non-concurrent unique index: all accurate. `CONCURRENTLY` inside the implicit multi-statement transaction: certain. |
| F2 | `ADD COLUMN … DEFAULT` hangs PGlite | **Wrong [probed]** | With a 150 s budget the fast-default variant completed in **7.4 s and passed 13/13**. My own 40 s attempts also "hung" while the machine was loaded, as did pure-JS lessons. Do not build a PGlite workaround for this; fix the timeout message instead (M1). |
| F3 | `node-streams` UTF-8 corruption; `.pipe()` | **Correct [reasoned]** | `Buffer#toString` on a partial sequence emits U+FFFD; there is no carry-over. |
| F4 | `sql-windows` frame/ties | **Correct [probed]** | `[1290,1290,1290]`. |
| F5 | React 18 removed the unmount warning | **Correct [probed]** | Debounce with no cleanup passes 14/14 on react-dom 18.3.1. |
| F6 | `react-compound-tabs` hint 4 | **Correct** | `hidden` content is out of the a11y tree. |
| F7 | `react-a11y-modal` | **Correct** | Plus the `onClose`-in-deps focus bounce is a real bug. |
| F8 | TS 5.5 inferred predicates make the `isString` starter already narrow | **Correct, and stronger than stated [probed]** | Installed TypeScript is **5.9.3** (package.json `^5.6.3`), not 5.6. The starter's `isString` produces no diagnostic. |
| F9 | Node 19 `server.close()` closes idle connections; 503-everything contestable | **Correct** | v19.0.0 changelog. |
| F10 | `craft-refactor` requires a behaviour change | **Half** | See section 2: it is stated in the task and hint 1; the defect is the contradictory framing sentence. |
| F11 | `Object.groupBy` unmentioned | **Correct** | Node 24 has it. |
| F12 | `js-retry-backoff` sleep not interruptible; jitter unpromised | **Correct** | |
| F13 | Float dollars in `react-reducer-cart` | **Correct (cosmetic)** | |
| F14 | README "each chapter ends in a boss" (8/18) and "one lesson you bounce off never walls off a chapter" | **Correct** | `lessonUnlocked` is strictly linear within a chapter; 2/3 < 0.7. |
| F15 | React 19 current; React Compiler stable; PG18 `uuidv7()` | **Correct** | React 19.0 Dec 2024; Compiler 1.0 Oct 2025; PG18 Sep 2025 ships `uuidv7()`. PGlite 0.2.17 here is PG16-era. |
| — | `js-error-classes` quadruple backticks "render oddly" | **Wrong** | `marked.parse` renders them as `<code>User 42 not found</code>`; checked. |
| — | PGlite extension availability (Opus flagged as unverified) | **Resolved [probed]** | In the sandbox as shipped: `to_tsvector('english', 'running quickly')` → `'quick':2 'run':1` (stemming works), `websearch_to_tsquery` works, a GIN `jsonb_path_ops` index and `jsonb_path_exists` work, `explain (format json)` works, and `exclude using gist (during with &&)` on a bare `tstzrange` works. `create extension btree_gist` fails with "extension is not available" because the worker calls `PGlite.create()` with no `extensions`; the package ships `btree_gist`, `btree_gin`, `pg_trgm`, `citext`, `ltree`, `hstore`, `uuid_ossp`, `tablefunc` and `vector` under `dist/contrib`. So P1/P3 (JSONB, EXPLAIN) need nothing; an FTS lesson needs nothing; a `(room_id WITH =, during WITH &&)` bookings lesson needs the one-line `extensions: { btree_gist }` in `worker.mjs`. |

---

## 4. Top 30 to build

### Challenge to the "must add 35"

Cut (with reason):
- `node-db-job-queue` (N2): `SKIP LOCKED` contention cannot be shown on single-connection PGlite; what remains is a CRUD exercise with a clock. Senior/infra, not the junior→mid line.
- `node-db-outbox` (N5), `sql-rls-tenancy` (P12), `node-worker-threads` (N14), `node-child-process` (N13), `node-realtime-quiz` (N19), `node-api-evolution` (N16): niche or infra for this target.
- `capstone-ship-feature` as a **new `project` kind** (X1): the value is real, the infra is not affordable in one session. Build it as a *chapter* of ordinary lessons instead (section 5).
- `node-deployability` quiz (N9): fold readiness/liveness/SIGTERM into the `node-graceful-shutdown` rewrite; a quiz of platform trivia is low signal.
- `js-intl` (J1): useful, but `js-dates-tz` carries the same Intl muscle; one Intl lesson is enough for a mid-level target.
- `sql-fts` (P2): many product teams never touch Postgres FTS; JSONB and EXPLAIN are the daily ones.
- `test-repo-postgres` (T8), `test-property` (T10), `test-ci-hooks` (T11): T8 needs two new kinds at once; T10/T11 are Should.

Kept from Opus with rewording or tightening: 24. Added or promoted: `sql-jsonb`, `sql-explain` (were 21–22 in Opus's list, promoted over `js-intl` and the deployability quiz), `test-strategy` quiz (cheap, gives the new track a concept spine).

### Two kinds the builder must add first

**`mutation`** (learner writes tests). Minimal implementation in `worker.mjs`, ~60 lines:
- Lesson fields: `subject` (reference source), `equivalents: string[]`, `mutants: { name: string; code: string }[]`, `kind: 'mutation'` (optionally `subjectKind: 'js' | 'react' | 'node'` to pick jsx/dom setup).
- The learner's `code` is a test file using the existing `describe/it/expect` against a global `subject`.
- Worker: set up the environment for `subjectKind`; compile and import the learner's file once (it registers into `registered`); snapshot and clear `registered`; for each variant `[reference, ...equivalents, ...mutants]`: compile + import the variant, set `globalThis.subject`, run the snapshot, collect pass/fail; emit synthetic results: `"reference: every test passes"` (must be true), `"equivalent #k: every test passes"` (must be true), `"mutant <name>: killed"` (must have ≥ 1 failing test). Optionally `"mutant <name> survived"` only names the mutant; hints reveal the names as now.
- Anti-gaming: `Function.prototype.toString = () => '[hidden]'` before importing the learner file; keep the existing per-kind budget; run the suite twice against the reference and require identical outcomes.
- The UI needs nothing new: results already render as a test list.

**`node-db`** (Node code against real Postgres). ~15 lines in `worker.mjs`: for `kind === 'node-db'` run `setupPostgres()` *before* importing the learner module, skip the per-test `begin/rollback` wrapper (these lessons manage their own transactions), expose `db` as a global and pass it into learner functions from the tests. Give it the SQL time budget (25 s) in `runner/index.ts`. The tests can wrap `db.query` in a spy to count round trips and assert parameter usage.

### The list

Ranking principle: (1) biggest junior→mid gap on *this* stack, (2) gradable without dictating internals, (3) infra cost. "Chapter" names an existing chapter or a new one (**bold**).

| # | id | Title | Kind | Chapter | Task (one line) | Grader asserts | Infra |
|---|---|---|---|---|---|---|---|
| 1 | `test-discriminating` | Tests that actually catch bugs | mutation (js) | **testing / Tests that discriminate** | Write a suite for a provided `slugify(title, { maxLength })`: lowercase, Unicode fold, collapse separators, trim, truncate at a word boundary, empty input. | All pass on reference + 1 equivalent (different regex strategy); kills 6 named mutants: `no-trim`, `keeps-double-dash`, `no-lowercase`, `truncate-mid-word`, `no-unicode-fold`, `empty-returns-undefined`. | mutation |
| 2 | `test-characterization` | Pin behaviour before you refactor | mutation (js) | **testing / Tests that discriminate** (place before `craft-refactor` in the DAG/prose) | Given the `processOrder` monolith from `craft-refactor`, write characterisation tests from its behaviour, not its code. | Passes reference + 1 equivalent (the refactored version); kills `round-moved`, `threshold-on-raw-subtotal`, `discount-cap-off`, `problem-order-changed`, `validation-short-circuits`. | mutation |
| 3 | `test-strategy` | What to test where | quiz | **testing / Tests that discriminate** | Unit vs integration vs e2e, testing trophy, snapshot abuse, 100 % coverage with 0 % mutation score, quarantining flakes, what belongs in pre-commit vs CI. | Quiz; every distractor must be one a competent engineer could pick. | none |
| 4 | `test-doubles` | Stubs, fakes, spies, and when not to mock | mutation (js) | **testing / Doubles, async, integration** | Tests for `sendOverdueReminders({ invoices, clock, mailer })` with the clock and mailer injected. | Passes reference + 1 equivalent that iterates in a different order (punishes order-coupled assertions the spec does not promise); kills `sends-twice`, `ignores-paid`, `off-by-one-day`, `wrong-recipient`, `uses-real-Date`. | mutation |
| 5 | `test-async-deterministic` | Testing async code without sleeping | mutation (js) | **testing / Doubles, async, integration** | Tests for a provided `retry`/`debounce` pair with an injectable `sleep`/scheduler. | Kills `no-await`, `extra-attempt`, `sleeps-after-last`, `debounce-leading-edge`; the whole suite must finish in < 500 ms (real sleeps fail). | mutation |
| 6 | `test-http-integration` | Integration-testing an endpoint | mutation (node) | **testing / Doubles, async, integration** | Start the notes API (`node-crud-boss` reference) on port 0 and test statuses, envelope, auth, validation, paging. | Kills `201-becomes-200`, `leaks-error-message`, `auth-missing-on-DELETE`, `validation-500`, `total-after-paging`, `patch-clears-tags`. | mutation |
| 7 | `test-rtl-behaviour` | Testing components by behaviour | mutation (react), **boss** | **testing / Doubles, async, integration** | RTL tests for the `LikeButton` and `Modal` references. | Passes reference + 1 equivalent with different markup/class names (punishes `querySelector`); kills `no-rollback`, `double-fire`, `focus-not-restored`, `escape-ignored`, `error-never-clears`. | mutation |
| 8 | `sec-sql-injection` | Parameterise, and allowlist what you cannot | node-db | **sql / Postgres from code** | Fix a search repository that concatenates `q`, `sort` and `dir` into SQL. | Payload corpus (`' or 1=1--`, `x'); drop table notes;--`, `sort=name;delete`) returns safe rows or 400; table intact; a `db.query` spy sees user input only in the params array; `sort`/`dir` outside the allowlist → 400. | node-db |
| 9 | `sec-authz-idor` | Object-level authorization | node | **node / Security** | Notes service where user A can read B's note by id; add ownership checks in the service; foreign ids → 404 not 403; admin override. | Service functions (tested directly, no HTTP) throw `NotFoundError` for foreign ids; list scoped to owner; admin sees all; handler maps to 404. No source grep. | none |
| 10 | `sec-password-hashing` | Storing passwords with scrypt | node | **node / Security** | `hash`, `verify`, `needsRehash` with params + salt encoded in the stored string. | Same password → different hashes; verify true/false; params round-trip; `needsRehash` when cost changes; malformed stored hash → `false`, never throws. Do **not** spy on `timingSafeEqual` (the `node-signed-tokens` trap); state it in the brief. | none |
| 11 | `sec-cookies-csrf` | Session cookies, SameSite and CSRF | node | **node / Security** | Login sets `HttpOnly; Secure; SameSite=Lax; Path=/`; state-changing requests require a matching `Origin` or a double-submit token; logout expires the cookie. | Parsed `Set-Cookie` attributes; cross-origin POST → 403; GET unaffected; logout → `Max-Age=0`; tests send the `cookie` header manually (Node `fetch` has no jar). | none |
| 12 | `sec-config-secrets` | Config from env, validated at boot | node | **node / Security** | `loadConfig(env)`: types, required keys, defaults, all problems reported at once; secrets redacted from `JSON.stringify` and `util.inspect`. | Error lists every bad key; `PORT=abc` rejected; no secret substring in `JSON.stringify(config)` or `inspect(config)`; a `redacted()` accessor still returns the real value. | none |
| 13 | `sec-react-xss` | XSS in React: the escape hatches | react | **react / Forms & widgets** | Render a user bio through a limited-markdown formatter without `dangerouslySetInnerHTML`; links reject `javascript:`/`data:`; `target=_blank` gets `rel="noopener noreferrer"`. | For a payload corpus the DOM contains no `on*` attributes and no script-capable `href`; legitimate links, bold and line breaks render. | none |
| 14 | `node-db-transactions` | Transactions in code: moving money | node-db | **sql / Postgres from code** | `transfer(db, { from, to, cents, idempotencyKey })`: one transaction, conditional debit (`UPDATE … WHERE balance >= $1 RETURNING`), rollback on any throw, idempotency table returning the original result. | Money conserved; an injected failure after the debit (a `db` wrapper that throws on the 2nd UPDATE) leaves no partial state; duplicate key returns the stored result; overdraft → typed error; params used. | node-db |
| 15 | `node-dataloader` | Batching away the N+1 in app code | node (pure) | **sql / Postgres from code** (rename `sql-n-plus-one` to "Nesting per-group results in one query" and pair them) | A tiny DataLoader over an injected `batchFn(keys)`: collect keys within a microtask, one call, results in key order, dedupe, per-key `null` for missing, per-key errors. | 50 `load()` calls → 1 `batchFn` call; order; dedupe; a missing key does not reject the batch; a `batchFn` throw rejects every pending load. | none |
| 16 | `sql-jsonb` | JSONB: querying, constraining, indexing | sql | **sql / Postgres features** | `events(payload jsonb)`: query with `->>`, `@>`, `jsonb_path_exists`; GIN index with `jsonb_path_ops`; a generated column for a hot key; a `CHECK (jsonb_typeof(payload->'items') = 'array')`. | Result rows; index exists and is GIN (`pg_indexes`); with `set enable_seqscan = off` the plan names the index; the CHECK rejects a bad shape. | none |
| 17 | `sql-explain` | Reading EXPLAIN and fixing the plan | sql | **sql / Postgres features** | Brief shows a slow query and its `EXPLAIN (ANALYZE, BUFFERS)`; learner adds a covering index (`INCLUDE`) so the plan is an Index Only Scan with no Sort. | `explain (format json)` with `enable_seqscan = off`: node type is `Index Only Scan`, no `Sort` node; index definition contains `include`. | none |
| 18 | `node-cache-singleflight` | An in-process cache that does not stampede | node (pure) | **node / Production** | `createCache({ max, ttlMs, now })` with `getOrLoad(key, loader)`: single-flight for concurrent misses, never caches a rejection, LRU eviction, optional stale-while-revalidate. | 100 concurrent misses → 1 loader call; a rejected load is retried next time; eviction order; TTL via injected clock. Replaces the `js-once-memoize` gap. | none |
| 19 | `node-structured-logging` | Structured logs with request context | node | **node / Production** | JSON-lines logger (level, time, msg, fields), child loggers, key redaction (`password`, `authorization`), `requestId` propagated with `AsyncLocalStorage` across awaits. | Parse emitted lines; the id appears in logs from nested async calls; two concurrent requests never cross ids; redaction replaces values not keys. | none |
| 20 | `node-sse` | Live updates with Server-Sent Events | node | **node / Production** | `/events` with `text/event-stream`, `id:` lines, `Last-Event-ID` resume, heartbeat comments, listener cleanup on disconnect. | A streaming `fetch` reader parses events; resume skips seen ids; after the client aborts, the emitter's listener count returns to 0. | none |
| 21 | `node-circuit-breaker` | Timeouts, fallbacks and circuit breakers | node (pure), **boss** | **node / Production** (and the hands-on half of `craft-incident`) | Wrap a flaky dependency: per-call timeout, fallback value, breaker with closed/open/half-open and an injected clock. | State transitions; no calls while open; exactly one half-open probe; timeout → fallback; success closes. | none |
| 22 | `js-dates-tz` | Dates without tears | js | **js / Text, numbers and time** | "Start of day in zone Z" via `Intl.DateTimeFormat` parts; "same wall-clock time tomorrow" across a DST change; add-one-month policy from 31 Jan (stated); UTC ISO round trips; `formatPrice(cents, currency, locale)` as the Intl warm-up. | DST-boundary cases for Europe/London and America/New_York; JPY has 0 decimals; no hand-rolled `toFixed`. Node 24 ships full ICU. | none |
| 23 | `js-regex` | Regex you can maintain (and that cannot DoS you) | js | **js / Text, numbers and time** | Parse access-log lines with named groups and the `v` flag; validate slugs; rewrite a catastrophic-backtracking pattern; use `RegExp.escape` (Node 24). | Parsed fields; the ReDoS input completes in < 2 s (the bad pattern takes far longer — coarse enough not to flake); escaping works. | none |
| 24 | `ts-schema-infer` | Types from your schema | typecheck (+ retype `ts-runtime-validator`) | **ts / Types in practice** | `Infer<typeof schema>` over the validator builders: optional keys become `?:`, arrays, nesting. | `Expect<Equal<Infer<typeof User>, { id: number; nickname?: string; tags: string[] }>>`; `@ts-expect-error` on misuse. | none |
| 25 | `ts-branded` | Branded types for ids and units | typecheck | **ts / Types in practice** | `UserId`, `OrderId`, `Cents` brands; validating constructors; `asserts x is UserId`. | Mixing ids is an error; a raw string is not a `UserId`; helpers preserve `Cents` through arithmetic. | none |
| 26 | `ts-tsconfig` | A tsconfig that catches bugs | quiz | **ts / Types in practice** | Concrete snippets: which flag makes this line an error? `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution` `nodenext` vs `bundler`, `erasableSyntaxOnly` / Node type stripping, `isolatedDeclarations`. | Quiz. | none |
| 27 | `react-error-boundary` | Error boundaries and recovery | react | react / Async UI & Quality | Class `ErrorBoundary` with `fallbackRender({ error, reset })`, `resetKeys`, `onError`; wrap a flaky widget so the page survives. | A child throw renders the fallback; `reset` remounts; a `resetKeys` change resets; the sibling stays mounted; an event-handler throw is *not* caught (documented). `console.error` silenced in tests. | none |
| 28 | `react-forms-at-scale` | Forms at scale | react | **react / Forms & widgets** | A `useForm`-style hook: validate on blur then on change, `aria-invalid` + `aria-describedby`, focus the first invalid field on submit, map server `details` onto fields, disabled only *while submitting*. | All via RTL: attributes, `document.activeElement`, server-error mapping, no disabled-while-invalid. | none |
| 29 | `react-combobox` | An accessible autocomplete | react, **boss** | **react / Forms & widgets** | ARIA 1.2 combobox: `aria-expanded`, `aria-controls`, `aria-activedescendant`, arrows/Enter/Escape, debounced fetch with abort, live region with result count. | Keyboard flows; `activedescendant` ids exist in the DOM; stale responses ignored (deferred promises); listbox hidden on Escape. | none |
| 30 | `craft-review-diff` | Review a real pull request | quiz (multi-select over a diff) | craft / Working like a mid | A 90-line diff in the question body with 5 seeded defects (missing `await`, SQL concatenation, unbounded list, secret in a log, off-by-one) and 3 decoy changes that are fine; options are line references. | Existing quiz grader; all-correct required. Zero infra — the `review` kind is not needed for this. | none |

**Is the Testing & Quality track worthwhile? Yes, explicitly.** Seven lessons (#1–7), five of them `mutation`, plus one quiz. It is the only track whose *mode* of practice is new, and "can this person write a test that fails for the right reason" is the single most reliable junior→mid signal on any team. Weight it 1.2 as Opus suggests. Do not bury these in other tracks.

Build order for one session: `mutation` runner → #1, #2, #4 (prove the design on pure JS) → `node-db` runner → #8, #14, #15 → then pure-Node items (#9–12, #18–21) which need no infra → React (#13, #27–29) → SQL (#16, #17) → TS/JS (#22–26) → #30 → #3, #5–7 last (they need the reference implementations from other lessons and the react/node variants of `mutation`).

---

## 5. Structure decisions

| Proposal | Decision | Reason |
|---|---|---|
| `mutation` kind | **Build now (landing: type only)** | Highest-value change in the app; ~60 lines in `worker.mjs`, no UI change. The in-flight `Mutant { label, code }` type needs `equivalents: string[]` added before the react/node mutation lessons are authored. |
| `node-db` kind | **Build now** | ~15 lines; unlocks #8, #14 and the honest version of `sql-n-plus-one`. |
| `review` kind (line-flagging UI) | **Never (for now)** | Needs a diff viewer with selection and a precision/recall grader. #30 as a multi-select quiz captures 80 % of it with 0 % of the cost. |
| `project` kind (multi-file staged) | **Never (for now)** | New editor, new runner, new progress model. Instead: a **Capstone chapter** of 4–5 ordinary lessons in a 7th "track" (migration → `node-db` repo → endpoint → typed client → React UI → learner-written tests), linearly gated, with a chapter boss. Same artefact, zero infra. |
| Prerequisite DAG (`requires: [...]`) | **Later** | Cheap in `content.ts` (~10 lines) but it changes the product's feel and the README's promise. Do it after the catalogue is at its new size, as Opus says. |
| Fix the 70 % arithmetic | **Build now (landing)** | The in-flight `content.ts` uses "all but one" at chapter level, which is what I would have proposed. Update the README to match. |
| Within-chapter "bounce-off" | **Build now (landing)** | The in-flight rule ("at most one unpassed lesson before this one") realises the README's promise without a DAG. |
| Challenge-out / placement quizzes | **Never (for now)** | Gameable, content-heavy, and the quiz leak (below) would make it worse. |
| Tag-based paths | **Later** | Trivial UI filter once the `security` tags exist; nothing to build until #8–13 land. |
| Spaced refresh variants | **Never (for now)** | Requires alternate fixtures/mutants per lesson; do after `mutation` exists, where it is natural (rotate mutants). |
| Quiz integrity | **Build now (landing)** | The in-flight `server/app.ts` `gradeQuiz` no longer returns `explain` on failure. Still worth adding: reveal explanations after 3 failed attempts so a stuck learner is not walled off; option shuffling can wait. |
| Readiness gates on depth | **Later** | Needs the testing track and security lessons to exist first. |
| Weekly goals | **Never (for now)** | Game-layer polish, not curriculum. |
| Bosses for every chapter / README claim | **Fix the README now**, mini-bosses later | Truth first. |
| React 19 upgrade | **Not this session** | `forwardRef`, `useOptimistic`, `use()` change three lessons' prose and the RTL setup. Decide before building `react-refs-imperative` (which is why it is not in the 30). |

---

## 6. What Opus missed

Concrete, lesson-level, with evidence.

**M1. The sandbox budget blames the learner for the machine.** `runner/index.ts` budgets 10 s (node), 20 s (react/typecheck), 25 s (sql). The `sql-migration` reference took **11 s** uncontended on this machine (Opus saw 21 s on theirs). Under load today, *every* probe — including a pure-JS `js-promise-parallel` variant — returned "Timed out … An infinite loop, an await that never settles, or a server you never closed are the usual causes" with **zero tests registered**. That message is wrong whenever the worker never reached the spec, and the learner loses their combo for it. Fix: (a) if no test ever started (`inFlight === null`), say "the sandbox could not start in time — try again" and do not count the attempt — **the in-flight runner's `ready` flag does exactly this; verify the submit path honours it and does not reset the combo**; (b) raise sql/react budgets to 60 s; (c) `verify-content` should print per-lesson ms so budget headroom is visible. Opus flagged individual `< 200 ms` assertions but not that the whole run is budget-fragile.

**M2. `node-crud-boss`: sorting the way the brief says fails the tests.** [probed: reference with `.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))` scores **25/27**, failing "lists newest first" (`["a","b","c"]` vs `["c","b","a"]`) and "pages, and reports the total before paging" (`"n1"` vs `"n7"`).] The brief says "Newest first". The test harness injects `now: () => clock` and never advances the clock in the list tests, so every note has an identical `createdAt`; a learner who sorts by `createdAt` descending (the literal reading) gets a stable sort in insertion order, i.e. **oldest first**, and fails "lists newest first" and "pages, and reports the total before paging". Only hint 6 (which costs XP) says "with sequential ids, `Number(b.id) - Number(a.id)` is equivalent". It is not equivalent under the test's frozen clock. Fix: advance the clock between creates in the harness, or say "newest first (highest id)" in the brief.

**M3. `ts-runtime-validator` reference accepts prototype-named extra keys.** [probed] `object({ id: number(), name: string() }).parse({ id: 1, name: 'ada', constructor: 'x' })` returns normally. The extra-key check is `Object.keys(value).find((k) => !(k in shape))`, and `'constructor' in shape` walks the prototype. So `toString`, `hasOwnProperty`, `constructor`, `__proto__` all slip through the "must reject extra keys" rule — in the one lesson whose point is that the boundary is untrusted. Fix: `Object.hasOwn(shape, k)`, and add a test with `constructor` as the extra key (it is also the natural place for the prototype-pollution sentence Opus wanted in `js-group-index`).

**M4. `sql-upsert`: keeping the starter's own comment fails a correct answer.** [probed: reference with the starter's `-- TODO` line left on top scores **9/10**, failing only "is a single statement, with no SELECT first: expected false to be true".] The starter is `-- TODO: one statement, no SELECT first\ninsert into page_views …`. The test "is a single statement, with no SELECT first" asserts `userSql.toLowerCase().trimStart().startsWith('insert')`. A learner who writes a perfect upsert *underneath the comment the app gave them* fails. Same family in `sql-keyset-pagination` (`not.toContain('offset')` fails on a comment mentioning offset). Fix: strip `--` comments before the check, or drop the check (the behavioural tests already prove it).

**M5. `react-effect-fetch` reference puts `load` in the dependency array; the starter has `[userId]` and hint 4 only says to add `attempt`.** With the signature the brief invites (`load(id, signal)`), an inline `load={(id, s) => fetch(…)}` refetches on every parent render and, combined with the `setState({ status: 'loading' })` at the top of the effect, loops. Opus flagged this exact hazard for `Resource` in `react-render-props` but not for the lesson it copied it from. Fix: say "assume `load` is stable" or hold it in a ref.

**M6. `react-a11y-modal` reference has the same class of bug (`onClose` in deps) — Opus caught the symptom but not that the fix is one line:** hold `onClose` in a ref or split the effect (focus management keyed on `open`, key listener keyed on `onClose`). Listed here because the builder should fix both M5 and M6 together.

**M7. `react-data-table` test comment is wrong; the assertions hold by luck.** "paginates the sorted, filtered set" says the search `'o'` matches five rows (bob, cy, ada, dee, eve); `platform` also contains `o`, so fay and gus match too — seven rows. With `pageSize={2}` the first two pages happen to be identical either way. The next author who changes the fixture will break this test and not understand why. Fix the comment or search for `'core'`.

**M8. `craft-refactor` source grep punishes a comment.** `expect(source).not.toContain('5000')` — a learner who writes `// default threshold was 5000` inside `processOrder` fails a correct refactor. Opus said the greps are "brittle"; this is the concrete failure mode.

**M9. The `explain` endpoint is guarded, the submit path is not.** `GET /quiz/:id/explain` refuses until passed (good), but `POST /lesson/:id/submit` already returned every failed question's `explain` in `result.tests[].error`. Opus stated the leak; it missed that the code *tries* to guard it and only guards the wrong door. One-line fix in `gradeQuiz`.

**M10. `react-keys-debug` is worth 75 XP and `react-controlled-form` 60, but the keys lesson has one behavioural idea and the form lesson has five.** Opus said "cut to 50"; I would also drop the source grep and add the idiomatic counterpart (`<Form key={userId}>` to reset state) so 75 is earned.

---

## 7. Probe log

Run via `runExercise` with the lesson's own tests unless noted. Times are unreliable (shared machine); pass/fail is not.

| Probe | Result |
|---|---|
| `js-map-limit` — chunk + `Promise.all` batching | **7/7 pass** |
| `react-memo-renders` — reference minus `useMemo` | **8/8 pass** |
| `react-derived-state` — `fullName` derived, `itemCount` via effect | **6/7**; only "holds no state at all" (`toString` grep) fails; "very first render" passes |
| `react-custom-hooks` — debounce with no cleanup | **14/14 pass** |
| `react-keys-debug` — starter | **3/6**; the three behavioural tests fail; "does not key by index" **passes** on the buggy starter |
| `sql-windows` — two same-day paid orders for Dara | running totals **`[1290,1290,1290]`**; test expecting three distinct values fails |
| `sql-migration` — reference, default budget, uncontended | 13/13 in **11.0 s** (budget 25 s) |
| `craft-refactor` — constant threshold, config key ignored | **21/22**; fails only `shippingCents(9999, {…10000}) → 499` |
| `js-resilient-client` — hint 5 literally (`backoff(attempt)`, 0-based) | **14/15**; `expected [0,1] to deeply equal [1,2]` |
| `ts-narrowing` — starter through `tsc` | 2 diagnostics: spec:17 (`isNonNull`), spec:25 (`hasKey`). **None for `isString`.** |
| `ts-runtime-validator` — extra key `constructor` | **accepted** (test expecting a throw fails) |
| PGlite features | FTS `english` stemming, `websearch_to_tsquery`, `jsonb_path_ops` GIN, `explain (format json)`, bare-`tstzrange` exclusion: **all work**. `create extension btree_gist`: "not available" (not loaded by the worker). |
| `node-signed-tokens` — named import | **13/14**; "uses a timing-safe comparison: expected 0 > 0" |
| `node-streams` — multibyte split | `[{"name":"caf��"}]` instead of `café` |
| `node-crud-boss` — sort by `createdAt` desc | **25/27**; "lists newest first" and "pages…" fail (frozen clock → insertion order) |
| `sql-upsert` — starter comment kept | **9/10**; "is a single statement, with no SELECT first" fails |
| `ts-narrowing` — reference minus `isString` annotation | **2/2 pass** (inferred predicate) |
| `ts-satisfies` — `satisfies` removed | **2/2 pass** |
| `js-promise-parallel` — hint-3 shape | **7/9**; sync-throw test fails, and `overlaps the work: expected 186 < 100` flaked under load |
| `react-controlled-form` — two `useState`s | **8/8 pass** |
| `sql-migration` — `add column … not null default 'free'` one-liner (150 s budget) | **13/13 pass in 7.4 s** — no hang |
| `sql-migration` — `create unique index concurrently` (150 s budget) | **0/13**; every test: "CREATE INDEX CONCURRENTLY cannot run inside a transaction block" |

First-pass runs under machine load, for the record: 12 of 22 probes returned "Timed out after N s … An infinite loop, an await that never settles …" with zero tests registered, including a pure-JS lesson with a 10 s budget. Re-running the same code with a 150 s budget produced the results above.

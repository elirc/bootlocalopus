# bootlocalopus curriculum review (04, opus)

Reviewer stance: staff engineer and mentor. Scope: the 72 lessons in `content/*/index.ts`, all read in full, plus the unlock and quiz-grading code in `server/content.ts` and `server/index.ts`. I checked the suspected grader holes by running modified solutions through the real runner (`server/runner`). A scratch script built those variants; no project files were changed. The report marks a claim **[verified]** only when I watched it happen.

---

## 1. Executive summary

**Verdict: the base is strong and the grading harness is the best part. But the curriculum is about 55% of what "junior to mid on this stack" needs, and roughly one lesson in six has a grader or brief defect. The README's claim that the graders are "adversarial on purpose" is not yet true.**

What is good and should be kept:
- The best lessons are excellent, take-home quality: `js-task-queue`, `js-resilient-client`, `react-effect-fetch`, `react-optimistic`, `react-data-table`, `node-request-body`, `node-middleware`, `node-rate-limit`, `sql-joins`, `sql-keyset-pagination`, `sql-analytics-boss`, `ts-typed-client` and `ts-conditional`. Each one finds the edge case that separates working code from correct code.
- The briefs follow a useful shape: lead with the failure, then the task, then the trap.

What is wrong, in order of severity:

1. **Grader holes on the headline skills [verified].**
   - `js-map-limit`: a fixed-batching implementation passes every test, which defeats the lesson. Hint 1 wrongly says batching fails.
   - `ts-satisfies`: removing `satisfies` still passes.
   - `react-memo-renders`: removing `useMemo` still passes, so the lesson teaches the cargo cult it warns against.
   - `react-custom-hooks` and `react-effect-fetch`: the "no setState after unmount" tests cannot fail, because React 18 removed that warning.
   - `react-keys-debug`: the buggy starter passes the "does not key by index" test.
2. **Factually wrong or outdated content.**
   - `sql-migration` is titled "does not lock the table", but its reference solution takes ACCESS EXCLUSIVE locks and does full scans. Its premise has been outdated since Postgres 11. The harness also *rejects* the correct tool (`CREATE INDEX CONCURRENTLY`) and *hangs* on `ADD COLUMN … DEFAULT` [verified].
   - The `node-streams` reference solution corrupts multibyte UTF-8 split across chunks [verified].
   - The `sql-windows` hint misdescribes the default window frame, and the reference gives wrong running totals on ties [verified].
   - `craft-refactor` requires a behaviour change in a lesson whose premise is "behaviour stays identical" [verified].
3. **Missing mid-level fundamentals.**
   - No lesson where the learner **writes tests**. This is the biggest gap in the curriculum.
   - No hands-on security: parameterised SQL, XSS, password hashing, cookies/CSRF, authorization, secrets.
   - No Postgres from application code: transactions exist only as a quiz.
   - No JSONB, full-text search or EXPLAIN reading.
   - No React error boundaries, refs, forms at scale or keyboard-accessible widgets.
   - No logging, config, jobs, SSE or in-process caching in code.
   - No Intl, dates or regex.
4. **The TypeScript track's two runtime lessons contain no types.** `ts-runtime-validator` and `ts-result` are graded as plain JS. `Infer<typeof schema>`, the entire point of a Zod-like validator, is never asked for.
5. **Game-layer integrity.**
   - A failed quiz submit reveals which questions were wrong *and* the explanations. The second attempt is then free, including the 200 XP quiz boss.
   - With linear gating, the 70% chapter rule works out to "you may skip the boss". The README's claim that "one lesson you bounce off never walls off a whole chapter" is false: `js-data` has 3 lessons, 2/3 < 0.7, and bouncing off any lesson before the last blocks everything after it.
   - The README says "each chapter ends in a boss", but only 8 of 18 chapters have one.

Recommendations in one line each:
- Fix the 14 verified defects before writing anything new.
- Add a **`mutation` lesson kind**: the learner writes tests, and the grader runs them against a correct implementation, an equivalent refactor that must also pass, and mutants that must fail.
- Add a **`node-db` kind** (a Node module plus a PGlite client).
- Add a **7th track, "Testing & Quality"**.
- Handle security as hands-on lessons inside the owning tracks plus a filtered "Security path", not as a separate track.
- Add a cross-track **capstone** (`project` kind).
- Replace linear lesson gating with a prerequisite DAG plus challenge-out.
- The full candidate list is 74 lessons; section 4 marks the 35 "must add".

---

## 2. Per-track critique of existing lessons

The 2–3 weakest lessons per track come first; other defects follow.

### JavaScript (15 lessons, 1,370 XP)

**Weakest:**

1. **`js-map-limit`: the central requirement is not graded [verified].** The brief says not to use fixed batches, and hint 1 says "Batching … fails the 'keeps the pool busy' test". It doesn't. With durations `[120,5,5,5,5,5,5,5]` and limit 2, batching takes 120 + 3×5 = 135 ms, under the 200 ms threshold. A chunk-and-`Promise.all` implementation passed all 7 tests.
   - Fix: make the slow item's duration dominate the threshold. For example `[200, 20×12]` with limit 2: a pool takes about 240 ms and batching about 320 ms, so assert `< 280`. Even better, assert on *start order*: record when each task starts, and require that task 3 starts before the slow task finishes.
   - `js-task-queue` has the same weakness in "keeps the pool busy rather than batching".
2. **`js-promise-parallel`: a hint walks the learner into a failing test [verified].** Hint 3 says to map each id to `.then(...).catch(...)`. Written the natural way, `loadOne(id).then(…)`, a synchronous throw from `loadOne` escapes the `map`, and "handles a loader that throws synchronously" fails. The brief never mentions synchronous throws. This is exactly the unsignposted gotcha AUTHORING.md forbids.
   - The `< 100 ms` wall-clock assertion in "overlaps the work" will flake on a loaded laptop. Assert peak concurrency, which is already measured, and drop the timing check.
3. **`js-retry-backoff`: promises more than it teaches or grades.**
   - The `why` line says "without jitter is how you DDoS yourself", but jitter is neither asked for nor tested.
   - "If it aborts during a wait, reject with the abort reason": the reference only checks `signal.aborted` *after* `sleep` returns, so a 30 s backoff cannot be cancelled. The test hides this because its injected `sleep` aborts synchronously and resolves immediately.
   - A mid-level engineer should race the sleep against the signal (`timers/promises` `setTimeout(ms, undefined, { signal })`).
   - "Mid-wait" test: `.rejects.toThrow()` with no message check, so rejecting with any error passes.

**Other defects:**
- `js-resilient-client`: the brief says "awaiting `backoff(attempt)`" without saying the index starts at 1. Hint 5 says to loop `attempt = 0..retries` and "only `await backoff(attempt)`", which produces `[0,1]` and fails "awaits backoff … with the attempt number" [verified]. State "attempt is 1 for the first retry" in the brief.
- `js-this-binding`: the brief says "without changing … the shape of the class", but the reference moves `describe` from the prototype to an own-property arrow field, which *is* a change of shape. Say "you may convert a method to a bound field". The test "keeps items per instance" already passes on the starter.
- `js-event-emitter` (boss): the test requires a handler unsubscribed *during* emit to still run. That matches Node's `EventEmitter`, but is the opposite of DOM `removeEventListener`. The brief says "iterate a snapshot" and should state the consequence explicitly. Nothing tests that a handler *added* during emit is not called in that emit.
- `js-event-loop` (quiz): several distractors are strawmen ("Spawns a worker thread", "They are dropped"). Q3's `setImmediate` option is only false for the script-top-level case; inside an I/O callback `setImmediate` always wins. Worth one sentence in the explanation.
- `js-group-index`: `Object.groupBy` / `Map.groupBy` have been standard since ES2024 and are in Node 21+. The lesson frames the topic as "reaching for lodash" and never mentions them. It also misses a free security lesson: `groupBy(items, 'name')` with a `"__proto__"` key on a `{}` accumulator. That is exactly why `Object.groupBy` returns a null-prototype object.
- `js-once-memoize`: the most common real `memoize` bug is caching a *rejected promise* forever. It isn't mentioned, and neither is unbounded growth.
- `js-error-classes`: `isRetryable` treats "no status" as retryable, so a `TypeError` from a programming bug gets retried. That is contestable and should at least be discussed. The brief's quadruple-backtick inline code renders oddly.
- Structure: chapter 3 has 3 lessons and chapter 4 has 2. Because 2/3 < 0.7, `js-data` must be completed 100% to open `js-errors` (see section 5).

### TypeScript (12 lessons, 1,090 XP)

**Weakest:**

1. **`ts-runtime-validator` and `ts-result`: typeless lessons in the TypeScript track.**
   - Both are `kind: 'ts'`, but starters, solutions and tests are plain JavaScript. Nothing requires or checks a single type annotation.
   - `ts-runtime-validator`'s brief says "Zod exists because you need a runtime check that also produces a type", then never asks for the type. The mid-level skill is `type Infer<S>`, so that `object({ id: number() })` yields `{ id: number }` and `optional()` yields an optional key.
   - `ts-result` says "the compiler makes you deal with it" and has no compiler involvement.
   - Also, Zod's default is to *strip* unknown keys, not reject them. The brief's "must reject extra keys" is a legitimate choice, but should be called one.
2. **`ts-typed-emitter` (boss, 210 XP): about six lines of interface for the largest XP in the track.**
   - The deliverable is an interface with five method signatures and three one-line types. Hints 1, 2 and 4 hand over `HandlerOf`, `emit` and `EventsWithoutPayload` verbatim. This is a 70–80 XP lesson.
   - Make it a boss by requiring a typed *implementation* (a `ts` + typecheck hybrid, or a `typecheck` lesson with `class TypedEmitter<E> implements …`). Or add `onAny`, wildcard `` `${string}:*` `` events, or a typed `waitFor(event): Promise<E[K]>`.
3. **`ts-satisfies`: `satisfies` is not graded [verified].** Replacing `as const satisfies Record<…>` with `as const` passes every test, and it can't be graded as written because the checked value lives in the solution file.
   - Fix: ask for `defineRoles<const T extends Record<string, {level:number;label:string}>>(roles: T): T`, using TS 5.0 `const` type parameters. The spec can then `// @ts-expect-error` a malformed call. That teaches `satisfies`-equivalent validation and `const` type parameters in one gradable lesson.

**Other defects:**
- `ts-generics`: an unedited authoring note shipped in the brief: "`sortBy` … must reject keys whose value is not comparable? No: keep it simple, any key is fine". Also, hints recommend `as` casts one lesson after `ts-narrowing` forbids them. Explain the difference: an internal builder cast is fine, a boundary cast is not.
- `ts-narrowing`:
  - "No `any` and no `as`" is stated but can't be checked by `tsc`.
  - `type _nums = Expect<Equal<ReturnType<typeof nums.filter<number>>, number[]>>` asserts on the standard library, not the learner's code.
  - Outdated for TS 5.6: since TS 5.5 the compiler *infers* type predicates, so the starter's `isString(value: unknown) { return typeof value === 'string' }` already narrows. Rewrite the brief around when inference works and when you must annotate.
- `ts-conditional`: six type utilities for 80 XP, and the distributive-conditional trap is disclosed only in hint 5. The brief does warn about it, to its credit. Fine, but underpriced relative to `ts-typed-emitter`.
- Coverage imbalance: 10 of 12 lessons are type gymnastics (`infer`, template literals, mapped types). Mid-level TS work at a product company is mostly:
  - typing React props;
  - branded IDs;
  - schema-to-type inference;
  - overloads and `const`/`NoInfer` generics;
  - `tsconfig` flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly` for Node type stripping);
  - module augmentation.

  None of these is covered.

### React (12 lessons, 1,160 XP)

**Weakest:**

1. **`react-memo-renders` teaches `useMemo` that does nothing [verified].** Removing `useMemo` around `visible` still passes all 8 tests. `visible` is never a prop, and the row items keep their identity whether or not the array is memoised. The lesson's premise is "sprinkling memo everywhere is cargo cult", yet hint 3 and the reference add exactly that.
   - Fix: either pass `visible` to a memoised child, such as a `<Summary rows={visible}>` that logs renders, so the memo is load-bearing; or make the lesson *about* removing a useless `useMemo`.
   - Also mention that the React Compiler (stable since late 2025) makes most manual memoisation unnecessary. A mid-level engineer in 2026 will meet it.
2. **`react-keys-debug`: a one-word fix at 75 XP, hint 1 gives it away, and one test is vacuous [verified].**
   - Hint 1 literally says "The fix is one word: `key={todo.id}`".
   - `expect(solution.TodoEditor.toString()).not.toContain('key={index}')` inspects *compiled* code, where JSX is gone (`key: index`). The buggy starter passes this test.
   - The behavioural tests are good. Cut to 50 XP, drop the source grep, and make the lesson richer: add a reorder or "move up" button, plus a `key` used deliberately to *reset* state (`<Form key={userId}>`), the idiomatic counterpart.
3. **`react-reducer-cart`: the brief omits UI the tests require.** The brief specifies `Add <name>` buttons, list items and the total. The tests click `Remove Widget` and `Clear` buttons the brief never mentions. The learner can't see the tests, so this is a pure guessing game.
   - Also: money is stored as float dollars (`price: 9.99`) and summed with `toFixed`, while the SQL track insists on integer cents and "never floats". Pick one story.

**Other defects:**
- `react-derived-state` [verified]:
  - "shows the count on the very first render, not one render late" cannot fail. RTL's `render` wraps in `act`, which flushes the effect, so the effect-synced version shows `3 items` too.
  - The only test that catches the effect version greps `toString()` for `useState`. A comment containing "useState" would fail a correct solution.
  - Use a render-count probe (`React.Profiler` `onRender` count, or `renderLog`) to assert a single commit.
- `react-custom-hooks` and `react-effect-fetch` [verified]:
  - The "clears its timer on unmount" and "does not set state after unmount" tests assert the absence of React's "unmounted component" warning. **React 18 removed that warning**, so these tests cannot fail. A debounce with no unmount cleanup passes everything.
  - The brief's framing ("no update after unmount leaks") is React 17 thinking.
  - To test cleanup, spy on `clearTimeout`, or count setter calls via a probe component that records renders after unmount.
- `react-controlled-form` [verified]:
  - "keeps both fields in one state object" passes with two `useState` calls. Either drop the requirement or drop the test name's claim.
  - A disabled submit with no visible error messages is itself an accessibility anti-pattern. Users are not told why they can't submit, and many design systems avoid disabled submits for this reason. Say so, or better, show field errors.
- `react-compound-tabs`:
  - Hint 4 says "returning hidden markup would leak content to screen readers". That is misleading: `hidden` / `display:none` removes content from the accessibility tree, and the WAI-ARIA APG tabs pattern keeps inactive panels mounted and hidden.
  - The component also omits the parts of the tabs pattern that make it accessible: arrow-key navigation with roving `tabIndex`, `aria-controls` and `aria-labelledby`.
  - The lesson is tagged a11y-adjacent but teaches a non-conformant widget.
- `react-a11y-modal`:
  - No focus trap (Tab walks out of an `aria-modal` dialog), no `inert` background, and no mention of native `<dialog>` + `showModal()`, which provides focus handling and Escape for free and has been baseline since 2022. "Doing one right is a portfolio-grade detail" overclaims.
  - Unsignposted gotcha: `onClose` is in the effect dependencies, so an inline `() => setOpen(false)` re-runs the effect on every parent render, bouncing focus to the trigger and back. The harness happens to survive it. Real apps won't.
- `react-render-props`: `Resource` has `load` in its dependency array. A consumer passing an inline function gets an infinite refetch loop, and nothing warns about it. `Resource` also duplicates `react-effect-fetch`. At 80 XP this lesson is padding.

### Node (12 lessons, 1,195 XP)

**Weakest:**

1. **`node-streams`: the reference solution has a real bug [verified], and the lesson teaches `.pipe()`.**
   - `buffer += chunk.toString('utf8')` decodes each chunk independently. A multibyte character split across a chunk boundary becomes `U+FFFD` twice (`"café"` → `"caf��"`). Use `StringDecoder`, `setEncoding('utf8')` on the source, or `new TextDecoder()` with `{stream:true}`.
   - Hint 4 recommends `for await (… of source.pipe(parser))`. `.pipe()` does not forward errors or destroy on failure: if the *source* errors, the parser never ends and the loop hangs. Teach `stream.pipeline` / `stream/promises`, or `source.compose(parser)`.
   - The tags say "backpressure", but nothing exercises it.
2. **`node-graceful-shutdown`: phase 1 is contestable as taught, and one hint is outdated.**
   - Answering *every* new request with 503 while waiting for the load balancer to notice means real user traffic, which the LB is still routing to you, gets errors during the propagation window.
   - The standard Kubernetes/ALB practice is:
     1. fail the *readiness* endpoint only;
     2. keep serving normal traffic for the propagation delay (a `preStop` sleep);
     3. `server.close()` and drain.

     The lesson should teach that distinction: readiness vs liveness vs traffic.
   - Hint 6 says to call `server.closeIdleConnections()` after `close()`. Since Node 19, `server.close()` closes idle connections itself. Harmless, but outdated for Node 24.
   - Missing: wiring `process.on('SIGTERM')`, and an async handler rejection that crashes the process mid-drain.
3. **`node-http-router`: brief and tests contradict each other.**
   - The brief's table defines 405 only for `POST /users` and says "anything else → 404". The test "405s a wrong method on /health too" expects `DELETE /health` → 405. Only hint 4 says otherwise.
   - Put a "wrong method on any existing route → 405 with `Allow`" row in the brief.

**Other defects:**
- `node-signed-tokens` over-constrains an implementation choice [verified]. "uses a timing-safe comparison" monkeypatches `crypto.timingSafeEqual` on the *default* export. A learner who writes `import { timingSafeEqual } from 'node:crypto'`, the more idiomatic style, fails, because ESM named bindings of builtins aren't re-synced. Either accept both styles (patch before import, or call `module.syncBuiltinESMExports()`) or tell the learner to use the default import.
  - The lesson also hand-rolls a JWT without the "use `jose`, and here is `alg:none` / algorithm confusion" coda a mid-level engineer needs.
- `node-crud-boss` (260 XP):
  - Compares the bearer token with `!==` two lessons after teaching `timingSafeEqual`.
  - Re-implements everything inline instead of *composing* the chapter's pieces (middleware chain, envelope, validator, rate limiter). A boss should reward integration, and this one rewards retyping.
  - Uses offset pagination while the SQL track rightly argues for keyset.
- `node-rate-limit`:
  - The bucket `Map` is never evicted, which is a memory leak keyed by client IP.
  - `req.socket.remoteAddress` behind a proxy is the proxy's IP. The `X-Forwarded-For` / trust-proxy question is a real mid-level gotcha that goes unmentioned.
- `node-http-semantics` (quiz): Q3's correct answer is the meta-option "400 or 422 — both defensible". That makes options 0 and 1 "wrong but also right", which is a contested-answer smell. Q5 misses the useful nuance that APIs often return 404 instead of 403 to avoid revealing a resource exists.
- `node-error-envelope`: the brief says unknown errors must still be logged. That is the other half of "don't leak", and nothing tests it. Pass a logger in and assert it received the original error.

### Postgres (13 lessons, 1,260 XP)

**Weakest:**

1. **`sql-migration`: the weakest lesson in the curriculum, and factually wrong for modern Postgres.**
   - The premise "Adding a NOT NULL column to a populated table fails" is only true without a default. Since Postgres 11, `ADD COLUMN plan text NOT NULL DEFAULT 'free'` with a constant default is a metadata-only change, with no rewrite and no backfill. For this exact task the three-step dance is *less* safe than the one-liner.
   - The title says "does not lock the table", but the reference solution:
     - runs `SET NOT NULL`: ACCESS EXCLUSIVE lock plus a full-table scan, unless a validated `CHECK (plan IS NOT NULL)` exists (PG12+ uses it to skip the scan);
     - runs `ADD CONSTRAINT … CHECK` without `NOT VALID`: ACCESS EXCLUSIVE plus a scan;
     - runs `CREATE UNIQUE INDEX` without `CONCURRENTLY`: a SHARE lock that blocks all writes for the duration of the build;
     - backfills the whole table in one `UPDATE`, which locks every row, bloats the table and generates huge WAL.
   - The harness makes the right answer impossible [verified]. `CREATE INDEX CONCURRENTLY` fails with "cannot run inside a transaction block". Separately, in my probes, any `ADD COLUMN … DEFAULT 'free'`, with or without `NOT NULL`, **hung the sandbox until timeout** (2 of 2 variants, 30 s each). The reference passed in about 21 s. So the modern idiom can't even be submitted, and the learner is told they wrote "an infinite loop".
   - Rewrite as expand/contract:
     - `SET lock_timeout`;
     - add the column;
     - backfill in batches (quiz or prose);
     - `CHECK (...) NOT VALID` then `VALIDATE CONSTRAINT`;
     - `SET NOT NULL`;
     - `CREATE UNIQUE INDEX CONCURRENTLY`.

     Pair it with a quiz on deploy ordering. The harness needs a non-transactional mode (section 5).
2. **`sql-indexes`: one vacuous test, and the rest depend on the planner.**
   - "is smaller than the table because it skips non-pending rows" asserts a *fixture* count and never touches the learner's index.
   - The partial index is never shown to be *used*.
   - The EXPLAIN tests run against a 10-row table with no `ANALYZE` (orders), so they depend on planner heuristics that can change between PGlite versions. Set `enable_seqscan = off` for plan-shape assertions, or seed enough rows and `ANALYZE`.
   - Hint 1's `placed_at desc` implies the `desc` is needed. A B-tree scans backwards for free; `DESC` only matters for mixed-direction orderings. Say so, because it is a classic misconception.
3. **`sql-n-plus-one`: the title promises something the lesson doesn't do.** The N+1 is an *application* pattern: a loop issuing queries. Here the learner never sees application code; they write a `LATERAL` / `json_agg` query. It is a good JSON-aggregation lesson under the wrong name. The fix a mid-level engineer reaches for daily is batching (`WHERE id = ANY($1)` / DataLoader) in the app layer, which isn't taught anywhere.

**Other defects:**
- `sql-windows` [verified]:
  - Hint 2 says `ORDER BY` inside `OVER` makes the frame "everything up to this row". Wrong: the default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, which includes *peers*.
  - With two paid orders on the same day, the reference produces running totals `[990, 1290, 1290]` instead of `[990, 1090, 1290]`.
  - Teach `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` plus a unique tiebreaker. This is exactly the "correct vs working" distinction the curriculum prides itself on.
- `sql-normalise`: joining back on `company_name` alone, while `DISTINCT` covers `(name, country)`, breaks if one company appears with two countries: the unique violation aborts the script. That is the real-world case (dirty spreadsheets). Signpost it, or seed it and make the learner decide.
- `sql-upsert`: requiring the substring `excluded` over-constrains. `last_seen = now()` is equally correct. The brief does instruct it, so this is signposted, but the grader should test behaviour.
- `sql-recursive-cte`: no cycle protection (PG14 `CYCLE` clause, or a path-array check). Real hierarchies get cycles.
- `sql-transactions`: a good quiz, but transactions *in code* (rollback on error, conditional updates, idempotency keys) appear nowhere hands-on.

### Engineering Craft (8 lessons, 710 XP)

**Weakest:**

1. **`craft-refactor` requires a behaviour change and doesn't teach the refactoring skill [verified].**
   - The brief: "Refactoring means changing structure while behaviour stays identical".
   - The tests require `shippingCents(9999, { freeShippingThresholdCents: 10000 })` → 499, i.e. a *new* configuration option the original ignored. A behaviour-preserving refactor, with 5000 extracted to a named constant, fails.
   - The structural tests grep `toString()` for `'5000'`, `'for (const item of order.items)'` and a `< 22` line count, which is brittle and gameable.
   - The real mid-level refactoring skill is *writing the characterisation tests first*. The learner never writes a test here. This should be a `mutation` lesson (candidate T7).
2. **`craft-incident` (boss, 200 XP): a quiz with telegraphed answers, and the answers leak.**
   - Every distractor is obviously wrong: "Wait ten minutes", "The on-call engineer was too slow", "Alert on any single 5xx".
   - Failing once shows every explanation (see section 5), so the second submit is free.
   - It also misses the nuance that makes incident response hard: "roll back" is unsafe if the deploy included a non-backward-compatible migration.
   - Make the boss hands-on: a service with a no-timeout dependency, where the learner adds timeout + fallback + circuit breaker against a simulated slow dependency. Keep 3–4 of the quiz steps as a pre-brief.
3. **`craft-caching` Q2 is malformed.** "What is a cache stampede, and what prevents it? Select all the mitigations" marks option 0 as correct, but option 0 is a *definition*, not a mitigation. That is a contested-answer defect. The quizzes in this track (and `craft-scoping`) also lean on strawmen ("Whatever you need it to be", "Delete the repository and re-clone"), which AUTHORING.md warns against.

**Structural problem:** 7 of 8 craft lessons are quizzes. Craft is where the curriculum most needs new *kinds*: code review of a real diff, writing tests, reading a profile. See section 4.

### Cross-cutting grader smells

- **Source-grepping tests:**
  - `react-derived-state`, `react-keys-debug` and `craft-refactor` use `Function.prototype.toString`.
  - `sql-upsert` and `sql-keyset-pagination` search `userSql` for substrings.

  They break on comments, are vacuous after JSX compilation, and punish equivalent solutions. Test behaviour; where structure is the point, use a render-count or a query-count spy.
- **Wall-clock assertions:** `js-promise-parallel` (`< 100 ms`), `js-map-limit` and `js-task-queue` (`< 200 ms`) and `node-graceful-shutdown` will flake on slow machines. Prefer ordering and concurrency assertions, or injected clocks.
- **Brief/test drift:** `react-reducer-cart`, `node-http-router` and `js-resilient-client` all have test expectations the brief never states. Add a `verify` lint that every string literal asserted by `toBe`/`getByRole(name)` appears somewhere in the brief. That is a cheap heuristic that would have caught all three.
- **XP versus difficulty:** `ts-typed-emitter` (210) and `craft-incident` (200) are overpriced. `react-keys-debug` (75) is overpriced for one word. `ts-conditional` (80, six utilities) and `node-request-body` (80) are underpriced relative to them.

---

## 3. Factual issues (outdated or wrong)

| # | Where | Issue | Severity | Evidence |
|---|---|---|---|---|
| F1 | `sql-migration` (title, brief, solution) | Premise outdated since PG11 (constant defaults are metadata-only). The "safe" solution takes ACCESS EXCLUSIVE locks and full scans, and blocks writes during index creation. The correct tools (`NOT VALID`/`VALIDATE`, `CONCURRENTLY`, `lock_timeout`) are absent. | High | Postgres docs; harness rejects `CONCURRENTLY` [verified] |
| F2 | Sandbox, SQL kind | `ALTER TABLE … ADD COLUMN … DEFAULT 'x'` hung the PGlite sandbox until timeout in 2 of 2 variants. The learner sees "infinite loop". | High | [verified]. Investigate PGlite 0.2 fast-default handling. |
| F3 | `node-streams` reference | Per-chunk `toString('utf8')` corrupts multibyte characters across chunk boundaries. `.pipe()` recommended where errors aren't propagated. | High | `"café"` → `"caf��"` [verified] |
| F4 | `sql-windows` hint 2 and reference | Default frame is RANGE (peers included), not "up to this row". Running totals are wrong on ties. | Medium | `[990,1290,1290]` [verified] |
| F5 | `react-custom-hooks`, `react-effect-fetch` | React 18 removed the "setState on unmounted component" warning, so the tests that assert its absence are vacuous and the framing is React 17. | Medium | Debounce without unmount cleanup passes [verified] |
| F6 | `react-compound-tabs` hint 4 | "Hidden markup would leak content to screen readers" is misleading (`hidden` / `display:none` is excluded from the a11y tree), and the component misses APG keyboard behaviour. | Medium | WAI-ARIA APG Tabs |
| F7 | `react-a11y-modal` | No focus trap or `inert`; native `<dialog>.showModal()` not mentioned. Claims to be "done right". | Medium | |
| F8 | `ts-narrowing` | Ignores TS 5.5 inferred type predicates; the starter's `isString` already narrows under TS 5.6. | Low | TS 5.5 release notes |
| F9 | `node-graceful-shutdown` hint 6 | `server.close()` has closed idle connections itself since Node 19. The phase-1 "503 all traffic" design is contestable versus readiness-probe practice. | Low / Med | Node 19 changelog |
| F10 | `craft-refactor` | Tests demand a behaviour change in a lesson defined as behaviour-preserving. | Medium | [verified] |
| F11 | `js-group-index` | Doesn't mention `Object.groupBy` / `Map.groupBy` (ES2024, Node 21+) or the `__proto__` key hazard they avoid. | Low | |
| F12 | `js-retry-backoff` | "Abort during a wait" isn't implemented: the sleep is not interruptible. Jitter is promised in `why` and never taught. | Low / Med | |
| F13 | `react-reducer-cart` | Float dollars in the UI contradict the curriculum-wide integer-cents rule. | Low | |
| F14 | README | "Each chapter ends in a boss" (8 of 18 do). "One lesson you bounce off never walls off a whole chapter" is false under linear gating and for any 3-lesson chapter. | Low (trust) | `server/content.ts` |
| F15 | Platform versions (strategic) | React is pinned at 18.3. React 19 has been current since Dec 2024: ref-as-prop (with `forwardRef` on the deprecation path), `useActionState`, `useOptimistic`, `use()`, form Actions, and the React Compiler. A learner who reaches "mid" on this curriculum in 2026 will review React 19 code. Postgres via PGlite 0.2 is PG16-era; PG18 added native `uuidv7()`, which is worth a mention in a keys quiz. | Strategic | |

Items I suspect but did **not** verify, so check before acting:
- Whether PGlite 0.2 ships `btree_gist` (needed for an exclusion-constraint lesson), the `english` text-search configuration, and `pg_trgm`.
- Whether the RLS behaviour for a non-superuser role can be exercised in PGlite's single-user setup.

---

## 4. Missing content

### Two new lesson kinds, and two more for later

**`mutation`: the learner writes the tests.** This is the most valuable addition the app could make.
- The learner submits a test file using the existing `describe`/`it`/`expect`, importing `subject`.
- The grader runs the suite three ways:
  1. **Against the reference implementation.** Every test must pass. A failing test here means "you asserted something the spec doesn't promise".
  2. **Against 1–3 *equivalent* implementations**, i.e. refactors with different internals such as a different DOM structure, a different call order to non-observable collaborators, or different variable names. Every test must pass. This punishes implementation-detail tests, which ordinary mutation testing does not.
  3. **Against N mutants.** Each must fail at least one test. Mutants are hand-written and named (`boundary-off-by-one`, `swallows-rejection`, `forgets-tenant-filter`), and their names are revealed as hints (hints cost XP, as now).
- Anti-gaming rules:
  - make `Function.prototype.toString` throw inside the suite, so tests can't fingerprint the implementation;
  - allow no filesystem or `process` access;
  - run the suite twice to catch nondeterminism;
  - enforce a time budget, which also discourages real `sleep`s;
  - reject suites where `fail()`/`throw` sits outside a conditional path, detected by the reference-pass requirement.
- Output: "7 of 9 mutants killed; survivors: `rounding-moved`, `empty-input`." A pass requires all mutants killed.

**`node-db`: Node code against a real Postgres.**
- The learner's module receives `db` (PGlite) with `query(text, params)` and `transaction(fn)`, plus the lesson fixtures.
- The grader can spy on `query` to assert that parameters are used, count round trips (N+1), and inject failures mid-transaction.
- Honest limitation: PGlite is single-connection, so real concurrency (blocking `FOR UPDATE`, `SKIP LOCKED` contention, serialisation failures) can't be demonstrated. Grade single-session semantics and SQL shape, and teach the concurrency behaviour through a quiz. An optional real-Postgres mode via the `embedded-postgres` npm package (real binaries, no Docker) would unlock true concurrency lessons later.

**Later:**
- **`review`**: the learner flags lines in a diff with a severity. Graded on recall of seeded defects (for example at least 4 of 5) and precision (at least 60%).
- **`project`**: multi-file, staged grading, used by the capstone.

### Full candidate list (74)

★ marks "must add" (35). Priority: Must / Should / Could.

**New track: Testing & Quality**

| # | id | title | kind | task sketch | grader asserts | pri |
|---|---|---|---|---|---|---|
| T1 | `test-discriminating` | Tests that actually catch bugs | mutation | Write tests for `slugify(title, {maxLength})`: Unicode folding, repeated separators, trimming, truncation at a word boundary, empty input. | Passes reference plus 1 equivalent; kills 8 mutants (e.g. `no-trim`, `truncate-mid-word`, `keeps-double-dash`, `empty-throws`). | ★ Must |
| T2 | `test-boundaries` | Boundary values and equivalence classes | mutation | Tests for `shippingBand(weightGrams, country)` with inclusive/exclusive edges. | Comparator-flip mutants (`<` vs `<=`) on each edge must die. | Should |
| T3 | `test-doubles` | Stubs, fakes, spies, and when not to mock | mutation | Tests for `sendOverdueReminders({ invoices, clock, mailer })`, with the clock and mailer injected. | Kills `sends-twice`, `ignores-paid`, `off-by-one-day`, `wrong-recipient`. Must pass an equivalent that batches mailer calls differently, which punishes over-specified call-count assertions. | ★ Must |
| T4 | `test-async-deterministic` | Testing async code without sleeping | mutation | Tests for a `retry`/`debounce` pair with an injectable scheduler. | Kills `no-await`, `extra-attempt`, `sleeps-after-last`. Suite must finish in under 150 ms, so real sleeps fail. | ★ Must |
| T5 | `test-http-integration` | Integration-testing an endpoint | mutation (node) | Start the notes server on port 0 and test status codes, envelope, auth and validation. | Kills `201-becomes-200`, `leaks-stack`, `auth-missing-on-DELETE`, `no-content-type`, `validation-500`. | ★ Must |
| T6 | `test-rtl-behaviour` | Testing components by behaviour | mutation (react) | RTL tests for `LikeButton` and `Modal`. | Kills `no-rollback`, `double-fire`, `focus-not-restored`. Must pass an equivalent with different markup and class names, which punishes `querySelector('.btn')` tests. | ★ Must |
| T7 | `test-characterization` | Pin legacy behaviour before you refactor | mutation | Given the `processOrder` monolith, write characterisation tests. | Kills realistic "refactor slips": `round-moved`, `threshold-on-raw-subtotal`, `problem-order-changed`, `discount-cap-off`. Replaces the current test-free premise of `craft-refactor`. | ★ Must |
| T8 | `test-repo-postgres` | Testing a repository against real Postgres | mutation (node-db) | Tests for a `NotesRepo`. | Kills `missing-tenant-filter`, `page-overlap`, `unique-violation-500`. | Should |
| T9 | `test-strategy` | What to test where | quiz | Unit vs integration vs e2e, the testing trophy, contract tests, snapshot abuse, 100% coverage with a 0% mutation score, quarantining flakes. | Standard quiz, with non-strawman options. | Should |
| T10 | `test-property` | Property-based thinking | mutation | A provided `forAll(gen, prop)` helper; write round-trip properties for `encodeCursor`/`decodeCursor`. | Kills mutants that break on `+/=` characters and the empty string. | Could |
| T11 | `test-ci-hooks` | Hooks, CI and required checks | quiz | What belongs in pre-commit (fast, local, staged files) vs CI; required checks; merge queues; caching; `--force-with-lease`; flaky-test quarantine vs retries. | Quiz. | Should |

**Security (hands-on, living in the owning tracks; tagged `security`)**

| # | id | title | kind | task sketch | grader asserts | pri |
|---|---|---|---|---|---|---|
| S1 | `sec-sql-injection` | Parameterise, and allowlist what you can't | node-db | Fix a search repository that concatenates `q`, `sort` and `dir`. Values become `$n` parameters; identifiers go through an allowlist, because you can't parameterise `ORDER BY`. | Payloads (`' or 1=1--`, `x'); drop table notes;--`, `sort=name;delete…`) return safe results or 400; table intact; spy shows user input only in the params array. | ★ Must |
| S2 | `sec-react-xss` | XSS in React: the escape hatches | react | Render a user bio with a limited-markdown formatter. No raw `dangerouslySetInnerHTML`; links reject `javascript:` / `data:`; `target=_blank` gets `rel="noopener noreferrer"`. | No `on*` attributes or script-capable URLs in the DOM for a payload corpus; legitimate links work. | ★ Must |
| S3 | `sec-html-escaping` | Server-side escaping and CSP | node | Server-rendered HTML page; context-aware escape (text vs attribute); strict CSP header. | Payloads escaped; CSP present without `unsafe-inline`. | Could |
| S4 | `sec-password-hashing` | Storing passwords with scrypt | node | `hash()` / `verify()` / `needsRehash()`, with the parameters and salt encoded in the stored string; random salt; constant-time compare; malformed-hash handling. | Different hashes for the same password; verify true/false; params round-trip; `needsRehash` when cost changes; rejects garbage without throwing. Accept both import styles. | ★ Must |
| S5 | `sec-cookies-csrf` | Session cookies, SameSite and CSRF | node | Login sets `HttpOnly; Secure; SameSite=Lax; Path=/`. State-changing requests require a matching `Origin` or a double-submit token. Logout expires the cookie. | Parsed `Set-Cookie` attributes; cross-origin POST → 403; GET unaffected; logout sets `Max-Age=0`. | ★ Must |
| S6 | `sec-config-secrets` | Config from env, validated at boot, secrets redacted | node | `loadConfig(env)`: types, required keys, defaults, *all* problems reported at once; secrets redacted from `JSON.stringify` and `util.inspect`. Mention `node --env-file`. | Error lists every bad key; `PORT=abc` rejected; no secret substring in stringify or inspect output. | ★ Must |
| S7 | `sec-authz-idor` | Object-level authorization (IDOR) | node | Notes API where user A can read B's note by id. Add ownership checks in the service layer; return 404 rather than 403 for foreign ids; admin override. | Cross-user GET/PATCH/DELETE → 404; list is scoped; admin sees everything; handler contains no authz (it's in the service). | ★ Must |
| S8 | `sec-threat-model` | Threat-modelling your own feature | quiz | SSRF via webhook URL, mass assignment, open redirect, a secret committed to git (rotate, don't just delete), lockfiles and supply chain, PII in logs. | Quiz. | Should |
| S9 | `sec-url-validation` | Safe redirects and webhook URLs | node | `safeRedirect` (same-origin relative only) and a webhook URL validator rejecting private ranges, noting the DNS-rebinding caveat. | Bypass corpus (`//evil`, `/\evil`, `http://127.1`, `[::1]`). | Could |

**Postgres**

| # | id | title | kind | task sketch | grader asserts | pri |
|---|---|---|---|---|---|---|
| P1 | `sql-jsonb` | JSONB: querying, constraining, indexing | sql | `events(payload jsonb)`: query with `->>`, `@>`, `jsonb_path_exists`; add a GIN (`jsonb_path_ops`) index; add a generated column for a hot key; add a `CHECK (jsonb_typeof(payload->'items')='array')`. | Results; index exists and is GIN; plan uses it with `enable_seqscan=off`; the constraint rejects bad shapes. | ★ Must |
| P2 | `sql-fts` | Full-text search that ranks | sql | Stored generated `tsvector` with `setweight` for title (A) and body (B); GIN index; `websearch_to_tsquery`; rank ordering. | Stemming ("running" finds "run"); title hits outrank body hits; `-word` exclusion and quoted phrases work; index exists. | ★ Must |
| P3 | `sql-explain` | Reading EXPLAIN and fixing the plan | sql | Given a slow query and its `EXPLAIN (ANALYZE, BUFFERS)` output in the brief, identify the problem (seq scan plus sort, bad estimate) and add a covering index (`INCLUDE`) so the plan becomes Index Only Scan with no Sort node. | `EXPLAIN (FORMAT JSON)` node types; no `Sort` node; index definition. | ★ Must |
| P4 | `sql-explain-quiz` | EXPLAIN literacy | quiz | Real plan snippets: estimate vs actual misestimates, nested-loop explosions, sorts spilling to disk, bitmap heap scans, loops × rows. | Quiz. | Should |
| P5 | `sql-safe-migrations` | Expand/contract without locking (replaces `sql-migration`) | sql + quiz | `lock_timeout`; add the column; `CHECK … NOT VALID` then `VALIDATE`; `SET NOT NULL` (scan skipped); `CREATE UNIQUE INDEX CONCURRENTLY`; a quiz on deploy ordering and why rollback breaks after contract. | Needs non-transactional grading (section 5). Constraint validated; index valid (`pg_index.indisvalid`); data intact. | ★ Must |
| P6 | `sql-timestamptz` | Time zones: timestamptz and reporting days | sql | Daily revenue per customer's zone with `date_trunc('day', ts AT TIME ZONE tz)`; the fixture straddles a DST change. | DST-edge rows land on the correct local day; `timestamp` vs `timestamptz` column choice checked. | Should |
| P7 | `sql-exclusion-booking` | No double bookings: exclusion constraints | sql | `bookings(room_id, during tstzrange)` with `EXCLUDE USING gist (room_id WITH =, during WITH &&)`. | Overlap rejected, adjacent allowed (`[)` bounds). Needs `btree_gist` in PGlite (verify). | Should |
| P8 | `sql-soft-delete` | Soft deletes without breaking uniqueness | sql | `deleted_at`; partial unique index `WHERE deleted_at IS NULL`; an `active_*` view. | Re-creating a deleted email succeeds; live duplicates rejected. | Should |
| P9 | `sql-relational-division` | Many-to-many: "has all of these tags" | sql | Join-table design (composite PK, cascades) plus a `HAVING count(DISTINCT tag) = n` query. | Correct sets, including duplicate-tag input. | Could |
| P10 | `sql-null-logic` | NOT IN, NULL and three-valued logic | sql | Fix a report that returns nothing because the subquery contains NULL; use `NOT EXISTS`. | Correct rows with a NULL present. | Could |
| P11 | `sql-latest-per-group` | Latest row per group: DISTINCT ON vs LATERAL | sql | Latest status per order, two ways. | Rows plus deterministic tiebreak. | Could |
| P12 | `sql-rls-tenancy` | Row-level security for multi-tenant data | sql | `ENABLE`/`FORCE ROW LEVEL SECURITY`, a policy on `current_setting('app.tenant_id')`, a non-owner role. | Cross-tenant rows invisible after `SET ROLE`. Feasibility in PGlite to verify. | Could |

**Postgres from code (`node-db` kind)**

| # | id | title | kind | task sketch | grader asserts | pri |
|---|---|---|---|---|---|---|
| N1 | `node-db-transactions` | Transactions in code: moving money | node-db | `transfer(db, {from, to, cents, idempotencyKey})`: a transaction, a conditional debit (`UPDATE … WHERE balance >= $1 RETURNING`), rollback on any throw, an idempotency table with a unique key returning the original result. | Money conserved; an injected failure after the debit leaves no partial state; a duplicate key returns the stored result; overdraft → typed error; parameters used. | ★ Must |
| N2 | `node-db-job-queue` | A durable job queue in Postgres | node-db | `enqueue`, `claimNext` (`FOR UPDATE SKIP LOCKED`, `run_at <= now`), exponential backoff on fail, dead-letter after max attempts, reclaim after visibility timeout (injected clock). | Claim order; backoff schedule; DLQ; reclaim; SQL shape includes `SKIP LOCKED`. Real contention covered in a quiz. | ★ Must |
| N3 | `node-dataloader` | Batching away the N+1 in app code | node | A tiny DataLoader: collect keys within a microtask, one `WHERE id = ANY($1)`, return in key order, dedupe, per-key errors, `null` for missing. | 50 `load()` calls → 1 query; order; dedupe; a missing key doesn't reject the batch. | ★ Must |
| N4 | `node-db-cursor-api` | Cursor pagination as an API | node-db | Opaque base64url cursor over `(created_at, id)`; `limit`; a `next` link; a sort allowlist; a tampered cursor → 400. | Stable under inserts; no duplicates or gaps across pages; tamper rejection. | Should |
| N5 | `node-db-outbox` | Transactional outbox | node-db | Write the order and an outbox row in one transaction; a relay publishes and marks rows sent; idempotent consumer. | Crash between commit and publish still delivers; redelivery is de-duplicated. | Could |

**Node platform and production**

| # | id | title | kind | task sketch | grader asserts | pri |
|---|---|---|---|---|---|---|
| N6 | `node-structured-logging` | Structured logs with request context | node | A JSON-lines logger (level, time, msg, fields), child loggers, key redaction (`password`, `authorization`), and a `requestId` propagated with `AsyncLocalStorage` across awaits. | Parse the emitted lines; the id appears in logs from nested async calls; concurrent requests never cross ids; redaction. | ★ Must |
| N7 | `node-sse` | Live updates with Server-Sent Events | node | `/events` with `text/event-stream`, `id:` lines, `Last-Event-ID` resume, heartbeat comments, listener cleanup on disconnect. | Stream reader parses events; resume skips seen ids; after the client aborts, the listener count returns to 0. | ★ Must |
| N8 | `node-cache-singleflight` | An in-process cache that doesn't stampede | node | `createCache({max, ttlMs, now})` with `getOrLoad`: single-flight for concurrent misses, no caching of rejections, LRU eviction, optional stale-while-revalidate. | 100 concurrent misses → 1 loader call; a rejection is retried next time; eviction order; TTL via the injected clock. | ★ Must |
| N9 | `node-deployability` | Deployable without Docker | quiz | `PORT` from env, stateless processes, logs to stdout, readiness vs liveness, SIGTERM, migrations as a separate release step, `--env-file`, NODE_ENV myths, systemd/PM2/platform buildpacks. | Quiz. | ★ Must |
| N10 | `node-fs-atomic` | Files safely: fs/promises, path, atomic writes | node | `saveJson(dir, name, data)` writes a temp file then renames it; rejects path traversal after `path.resolve`; `listJson` with `Dirent`. | Traversal corpus (`../`, absolute paths, encoded forms) rejected; no partial file ever visible; works with Windows separators. | Should |
| N11 | `node-pipeline` | pipeline, backpressure and gzip (and a rewrite of `node-streams`) | node | Compress a generated stream via `pipeline(src, transform, createGzip(), dest, {signal})`. | A source error rejects and destroys the destination; the producer pauses (bounded buffer); abort cancels. | Should |
| N12 | `node-profiling` | Finding the hot path | quiz + node | Measure event-loop delay with `perf_hooks.monitorEventLoopDelay`; read a provided `--cpu-prof` summary and a React Profiler export. | Quiz on the artifacts, plus a node part asserting that p99 delay stays under X after moving work off the loop. | Should |
| N13 | `node-child-process` | spawn, not exec | node | `run(cmd, args, {timeoutMs, signal, maxOutput})`: no shell, output capped, typed non-zero-exit error, kill on timeout. | Shell metacharacters in args are inert; timeout kills; the exit code is carried. Uses `process.execPath -e`. | Should |
| N14 | `node-worker-threads` | Offloading CPU work | node | A worker pool of size N for a CPU-heavy hash. | Main-loop tick lag stays low during the work; results in order; worker crash → rejection, not a hang. | Should |
| N15 | `node-circuit-breaker` | Timeouts, fallbacks and circuit breakers | node | Wrap a flaky dependency: per-call timeout, fallback value, a breaker with open, half-open and closed states (injected clock). | State transitions; no calls while open; a half-open probe. Makes the incident boss hands-on. | Should |
| N16 | `node-api-evolution` | Versioning, pagination and filtering conventions; OpenAPI thinking | quiz | Is this change breaking? (A new required field, an enum value added, a renamed field.) Path vs header versioning; `Deprecation`/`Sunset` headers; `filter[x]`/`sort=-y`/`fields=` conventions; describing an endpoint in OpenAPI first. | Quiz. | Should |
| N17 | `node-events-async` | `events.once`, `events.on`, AbortSignal | node | Await `ready` with a timeout; consume an emitter as an async iterator; the `'error'` event semantics. | Timeout rejects; the iterator stops on abort; an unhandled `'error'` throws. | Could |
| N18 | `node-http-conditional` | ETags and conditional requests | node | Weak ETag, `If-None-Match` → 304, `Cache-Control` private vs public, `Vary`. | Headers and statuses. | Could |
| N19 | `node-realtime-quiz` | WebSockets vs SSE vs polling | quiz | Fan-out, sticky sessions, auth on upgrade, proxies, backpressure. | Quiz. | Could |

**JavaScript**

| # | id | title | kind | task sketch | grader asserts | pri |
|---|---|---|---|---|---|---|
| J1 | `js-intl` | Intl: money, plurals, lists, relative time | js | `formatPrice(cents, currency, locale)` (JPY has 0 decimals); `Intl.PluralRules` for en and pl; `ListFormat`; `RelativeTimeFormat`. | Exact outputs across locales; no hand-rolled `toFixed`. | ★ Must |
| J2 | `js-dates-tz` | Dates without tears | js | "Start of day in zone Z" via `Intl.DateTimeFormat` parts; add one month from 31 January (policy stated); "same wall-clock time tomorrow" across DST; UTC ISO round-trips. Mention Temporal as it lands. | DST-boundary cases for Europe/London and America/New_York. | ★ Must |
| J3 | `js-regex` | Regex you can maintain (and that can't DoS you) | js | Parse access-log lines with named groups and the `u`/`d` flags; validate slugs; rewrite a catastrophic-backtracking pattern; `RegExp.escape` (Node 24). | Parsed fields; the ReDoS input completes in under 50 ms; escaping works. | ★ Must |
| J4 | `js-iterables` | Symbol.iterator and iterator helpers | js | Make a `Paginated` class iterable and async-iterable; use iterator helpers (`.map/.filter/.take`); early `break` calls `return()` for cleanup. | Spread works; laziness counter; cleanup called. | Should |
| J5 | `js-proxy-reflect` | Proxy and Reflect: observable state | js | `observe(obj, onChange)` with deep paths, arrays and `delete`, using `Reflect` so getters and receivers behave. | Change log with paths; getter `this` correct; `set` trap returns the `Reflect` result. | Should |
| J6 | `js-money-allocation` | Floating point and money | js | Split a total across N parts or ratios without losing a cent (largest remainder); `BigInt` ids and JSON. | Sums preserved; deterministic remainder placement. | Should |
| J7 | `js-modules-quiz` | ESM and CJS in 2026 | quiz | `require(esm)`, the `exports` field, the dual-package hazard, top-level await, Node type stripping. | Quiz. | Could |

**TypeScript**

| # | id | title | kind | task sketch | grader asserts | pri |
|---|---|---|---|---|---|---|
| TS1 | `ts-schema-infer` | Types from your schema | typecheck | Types for the validator lesson: `Infer<typeof schema>` with optional keys as `?:`, arrays and nesting (and fix `ts-runtime-validator` to be typed). | `Expect<Equal<Infer<typeof User>, {...}>>`; `@ts-expect-error` on misuse. | ★ Must |
| TS2 | `ts-branded` | Branded types for ids and units | typecheck | `UserId`, `OrderId`, `Cents`; validating constructors; assertion functions (`asserts x is UserId`). | Mixing ids is an error; arithmetic on `Cents` preserved by helpers. | ★ Must |
| TS3 | `ts-tsconfig` | A tsconfig that catches bugs | quiz | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: nodenext` vs `bundler`, `erasableSyntaxOnly` / Node type stripping, `isolatedDeclarations`. | Quiz on concrete snippets ("which flag makes this line an error?"). | ★ Must |
| TS4 | `ts-react-props` | Typing React components | typecheck | Props as a union (`href` xor `onClick`); extend `ComponentProps<'button'>`; a generic `List<T>`; typed refs. | Misuse errors; inference of `T`. | Should |
| TS5 | `ts-generics-advanced` | Overloads, const type params, NoInfer | typecheck | `defineRoles<const T>` (replaces the ungradable `satisfies` bit); a `NoInfer` default; overloads for `fetchJson`. | Literal preservation; inference not polluted by the default. | Should |
| TS6 | `ts-module-augmentation` | Augmenting third-party types | typecheck | Type `ProcessEnv` keys and `Request['user']` via declaration merging. | Access typed; unknown env key errors. | Could |

**React**

| # | id | title | kind | task sketch | grader asserts | pri |
|---|---|---|---|---|---|---|
| R1 | `react-error-boundary` | Error boundaries and recovery | react | Class `ErrorBoundary` with a `fallbackRender({error, reset})`, `resetKeys`, `onError`; wrap a flaky widget so the rest of the page survives. | A child throw renders the fallback; `reset` remounts; `resetKeys` change resets; the sibling stays mounted; event-handler errors are *not* caught (documented). | ★ Must |
| R2 | `react-refs-imperative` | Refs, forwardRef and useImperativeHandle | react | `TextField` exposing only `{focus, clear}`; a callback ref measuring an element; no ref reads during render. (React 18 `forwardRef`; note ref-as-prop in 19.) | `ref.current.focus()` moves focus; `clear` resets; no other DOM methods exposed. | ★ Must |
| R3 | `react-forms-at-scale` | Forms at scale | react | A `useForm`-style hook: validate on blur then on change, errors wired via `aria-invalid` and `aria-describedby`, focus the first invalid field on submit, map server `details` onto fields, a field array with stable keys, disabled only *while submitting*. | All of the above via RTL; no disabled-while-invalid. | ★ Must |
| R4 | `react-combobox` | An accessible autocomplete | react | ARIA 1.2 combobox: `aria-expanded`, `aria-controls`, `aria-activedescendant`, arrows/Enter/Escape, debounced fetch with abort, a live region for the result count. | Keyboard flows; activedescendant ids exist; stale responses ignored. | ★ Must |
| R5 | `react-suspense-lazy` | Suspense and lazy boundaries | react | `lazy` routes with nested `Suspense`; placing boundaries so a slow widget doesn't blank the page. (Data Suspense via `use()` once on React 19.) | Only the inner fallback shows; content appears. | Should |
| R6 | `react-portal-toast` | Portals: toasts that escape overflow | react | `createPortal` into `document.body`; React-tree event bubbling through the portal; an `aria-live="polite"` region; auto-dismiss with cleanup. | Node is in `body`; the parent `onClick` fires; the live region is announced; timers cleared. | Should |
| R7 | `react-query-cache` | A tiny server-state cache | react | `useQuery(key, fn)` with a shared cache, dedupe, stale-while-revalidate, `invalidate(key)` after a mutation. | Two components, one fetch; stale data shown during refetch; invalidation refetches. | Should |
| R8 | `react-profiler` | Measuring renders with the Profiler | react | Wrap with `<Profiler onRender>`, report commits per interaction, then fix the context value that re-renders everything. | Commit counts before and after. | Should |
| R9 | `react-context-store` | Context without re-rendering the world | react | Split state and dispatch contexts; `useSyncExternalStore` with a selector. | Only the selecting components re-render. | Could |
| R10 | `react-url-state` | Filters in the URL | react | Sync filters with `URLSearchParams` and `history.replaceState`; handle `popstate`. | jsdom location assertions. | Could |

**Craft and capstone**

| # | id | title | kind | task sketch | grader asserts | pri |
|---|---|---|---|---|---|---|
| C1 | `craft-review-diff` | Review a real pull request | review | A 90-line diff with 5 seeded defects (missing `await`, SQL concatenation, unbounded list, a secret in a log, an off-by-one) plus 3 decoys that are fine. | Recall of at least 4 of 5, precision of at least 60%, severity labels on blockers. | ★ Must |
| C2 | `craft-feature-flags` | Feature flags and progressive rollout | js | Deterministic percentage bucketing by hashing `userId`, allow/deny lists, kill switch, fail closed. | Stable buckets; distribution within tolerance; errors → default. | Could |
| X1 | `capstone-ship-feature` | Capstone: ship "shared notes" end to end | project | 1. Migration (expand) plus RLS or authz. 2. Repository with transaction and idempotency. 3. Endpoint with validation, envelope and authz. 4. Typed client via `Infer`. 5. React UI with optimistic update and an accessible form. 6. Learner-written tests that kill the provided mutants. | Five staged graders, each reusing a lesson's grader; stage XP; big readiness weight. | ★ Must |

### The 35 "must add", in priority order

1. `test-discriminating` (T1)
2. `test-characterization` (T7), which also replaces the premise of `craft-refactor`
3. `test-doubles` (T3)
4. `test-http-integration` (T5)
5. `test-rtl-behaviour` (T6)
6. `test-async-deterministic` (T4)
7. `sec-sql-injection` (S1)
8. `node-db-transactions` (N1)
9. `sql-safe-migrations` (P5), a replacement
10. `sec-authz-idor` (S7)
11. `sec-password-hashing` (S4)
12. `sec-cookies-csrf` (S5)
13. `sec-config-secrets` (S6)
14. `sec-react-xss` (S2)
15. `node-dataloader` (N3)
16. `node-db-job-queue` (N2)
17. `node-structured-logging` (N6)
18. `node-cache-singleflight` (N8)
19. `node-sse` (N7)
20. `node-deployability` (N9)
21. `sql-jsonb` (P1)
22. `sql-explain` (P3)
23. `sql-fts` (P2)
24. `react-error-boundary` (R1)
25. `react-forms-at-scale` (R3)
26. `react-combobox` (R4)
27. `react-refs-imperative` (R2)
28. `ts-schema-infer` (TS1)
29. `ts-branded` (TS2)
30. `ts-tsconfig` (TS3)
31. `js-dates-tz` (J2)
32. `js-intl` (J1)
33. `js-regex` (J3)
34. `craft-review-diff` (C1)
35. `capstone-ship-feature` (X1)

Deliberately *not* in the 35, although they were in the requested topic list:
- Portals and Suspense (R5, R6): valuable, but React 19 changes them materially, so author them after the upgrade decision.
- Proxy/Reflect and iterators/Symbol (J4, J5): nice, but rarely on a mid-level's critical path.
- child_process and worker_threads (N13, N14): Should, because they are real but occasional.
- Profiling (N12): Should, because it depends on a quiz-with-artifact format.
- The git hooks and CI quiz (T11): Should, because it's cheap and can go in any time.
- Timestamptz (P6): Should, because J2 covers the thinking.

---

## 5. Structure and progression

### Track shape

The six tracks are the right *language* split but the wrong *skill* split. Testing is the largest single gap between a junior and a mid-level engineer, and it has no home.

Proposed shape (about 150 lessons once the must-adds and fixes land):

| Track | Chapters (new in **bold**) |
|---|---|
| JavaScript | Closures · Async · Data shaping · Errors · **Text, numbers and time** (Intl, dates, regex, money) |
| TypeScript | Foundations · Type-level · Boundaries (made genuinely typed) · **Types in practice** (branded, schema inference, React props, tsconfig) |
| React | State · Composition · Async UI · **Boundaries and escape hatches** (error boundaries, refs, portals, Suspense) · **Forms and accessibility** (forms at scale, combobox, XSS) |
| Node | HTTP · API · Runtime · **Platform** (fs, pipeline, child_process, workers, events) · **Production** (config, logging, caching, SSE, circuit breaker, deployability) · **Security** (password hashing, cookies/CSRF, authz, config secrets) |
| Postgres | Modelling · Querying · Correctness and performance · **Postgres features** (JSONB, FTS, EXPLAIN, time zones) · **Postgres from code** (`node-db`: transactions, SQL injection, DataLoader, job queue, cursor API) |
| **Testing and Quality** (new) | Tests that discriminate (T1, T2, T7) · Doubles and async (T3, T4, T9) · Integration and UI (T5, T6, T8) |
| Craft | Working like a mid (plus `review` kind) · Systems thinking · **Shipping** (CI/hooks, deployability, flags, migrations and rollback) |
| Capstone | One `project`, unlocked at about 60% readiness |

**Should Security be a track? No.** Make it a *path*.

Security lives in the code it protects. A separate track drifts into quizzes about OWASP acronyms, and teaches people that security is somebody else's chapter. Instead:
- put hands-on security lessons in the owning tracks (the Node "Security" chapter, `sec-react-xss` in React, `sec-sql-injection` in Postgres-from-code);
- tag them `security`;
- add a UI filter / "path" that lists all security lessons in order;
- make the capstone's authz stage the security boss;
- require the security path for "Mid" readiness (see below).

**Should Testing be a track? Yes**, because the `mutation` kind is a new *mode of practice*, not a topic. Folding it into other tracks would bury the most transferable skill in the app. Weight it 1.2, the highest.

### Boss cadence

- The README claims every chapter ends in a boss; 8 of 18 do. Either make it true or change the claim. I recommend making it true, with **mini-bosses** at 120–150 XP for chapters that lack one.
- Bosses should **integrate the chapter**, not restate it.
  - `node-crud-boss` should import and compose the middleware chain, error envelope, validator, token verifier and rate limiter the learner already wrote. Pre-fill them from the learner's passed solutions, or provide reference modules.
  - `ts-typed-emitter` should type the JS `Emitter` the learner built.
- No quiz-only bosses. Split `craft-incident` into a hands-on circuit-breaker boss (N15) with a short quiz pre-brief.
- **A capstone that spans tracks: yes.** Adults learning at work are motivated by artefacts, and the capstone is also where readiness is *earned* rather than accumulated. Stage it so it can be done in five 45-minute sessions.

### Progression: the current rules versus what adults at work need

What the rules actually do, from `server/content.ts`:
- Within a chapter, lesson *k* requires lesson *k−1*. So bouncing off lesson 2 of 5 blocks 3, 4 and 5, leaving you at 1/5. The 70% rule never helps you there.
- The 70% rule therefore only ever lets you skip the *tail* of a chapter, which is where the bosses are. In effect, "the boss is optional for unlocking the next chapter". That may be fine, but it should be a decision rather than an accident.
- For 3-lesson chapters, 2/3 = 0.667 < 0.7, so 100% is required. That means `js-data` gates `js-errors` on every lesson passing, contradicting the README.
- `/lesson/:id/run` doesn't check the unlock state, so a locked lesson can be graded; only submit is gated. That's harmless, but it shows the lock is cosmetic.

What adults learning at work actually need:
1. **Just-in-time access.** "I'm writing a migration tomorrow" beats a linear path. Linear gating makes an engineer grind closures to reach the lesson they need this week.
2. **Credit for what they already know.** Grinding known material is the fastest way to lose an adult learner.
3. **Short, estimable sessions.** Lessons should show "about 20 min" and fit a lunch break.
4. **Retention over completion.** The goal is readiness in six months, not a completed checklist.

Proposals, most impactful first:
- **Replace linear gating with a prerequisite DAG.** Lessons declare `requires: [...]` (for example `ts-typed-emitter` requires `js-event-emitter`, and `node-crud-boss` requires the chapter's pieces). Everything else is open. Show "recommended next" rather than locks. Keep locks only on bosses and the capstone.
- **Challenge out.** Passing a chapter boss first try credits the chapter's other lessons as "tested out" at 50% XP. A placement quiz per track (10 minutes) can pre-open chapters.
- **Tag-based paths**: "Writing a migration", "Securing an endpoint", "My first React form", "On-call week". Each is an ordered list across tracks. This is how a lead would onboard someone.
- **Spaced "refresh" variants.** Two and six weeks after a pass, offer the lesson again with different fixtures or mutants, for small XP, and use the result in readiness. That is cheap with the existing graders, and it measures retention.
- **Readiness should gate on depth, not weighted completion.** Today a quiz's XP counts like code. Make "Mid" require:
  - the testing chapter 1 pass;
  - the security path;
  - one boss per track;
  - the capstone.
- **Weekly goals instead of (or alongside) daily streaks.** "Three sessions this week" matches working adults better than a daily streak, even with freezes.
- **Quiz integrity.** On a failed submit, show *how many* answers were wrong, not which ones, and not the explanations. Reveal explanations after a pass or after three attempts. Shuffle option order. Draw quiz bosses from a question pool. Today, a failed attempt costs only the 25% first-try bonus and the combo; the explanations then hand over the answers.
- **Fix the 70% arithmetic** if you keep chapter unlocks: use `ceil(0.7 × n) − (n ≤ 3 ? 1 : 0)`, or simply "all but the boss", and say so in the README.

---

## 6. Recommended authoring order

The ordering principle: **trust in the grader is the product**, so defects come first. Then build the infrastructure that unlocks the most lessons, then author in the order of the "must add" list.

**Phase 0: fix what is there (about one week).**
1. `js-map-limit` and `js-task-queue`: make batching fail (start-order assertion); fix hint 1.
2. `sql-migration`: rewrite as `sql-safe-migrations` (P5). Add a per-lesson `transactional: false` SQL mode (fresh PGlite per test, or clone a template datadir). Investigate the `ADD COLUMN … DEFAULT` hang.
3. `node-streams`: fix the UTF-8 decoding, teach `pipeline`, add the split-multibyte test.
4. `sql-windows`: fix hint 2, add a tie test, teach `ROWS`.
5. `craft-refactor`: make the tests behaviour-preserving; then later replace or pair it with T7.
6. Vacuous or over-constraining tests:
   - React 18 unmount-warning tests: spy on `clearTimeout` and setter calls instead;
   - the `react-keys-debug` source grep;
   - the `react-derived-state` first-render test (use a commit counter);
   - the `sql-indexes` fixture count;
   - `node-signed-tokens` named import;
   - `react-controlled-form` "one state object";
   - `react-memo-renders` (make `useMemo` load-bearing or remove it);
   - `ts-satisfies` (the `defineRoles<const T>` rewrite).
7. Brief/test drift: `react-reducer-cart` (Remove/Clear), `node-http-router` (405 rule), `js-resilient-client` (1-based backoff), `js-promise-parallel` (sync throw, hint 3), `ts-generics` (the stray authoring note).
8. Quiz integrity (don't reveal which questions failed), plus the `craft-caching` Q2 rewording and a strawman pass over all 10 quizzes.
9. README: the boss claim, the 70% claim, the kind counts after changes.
10. Add a `verify` lint: string literals the tests assert must appear in the brief.

**Phase 1: the `mutation` kind (about 1.5 weeks including 3 lessons).** Build the runner (reference, equivalents, mutants, anti-fingerprinting, time budget). Author T1, T7 and T3 to prove the design. These three alone change what "done with this app" means.

**Phase 2: the `node-db` kind plus the data-safety core.** N1 (transactions), S1 (SQL injection), N3 (DataLoader), N2 (job queue). Rewrite `sql-n-plus-one` as a companion to N3.

**Phase 3: the Node security chapter.** S7, S4, S5, S6, then S2 on the React side.

**Phase 4: testing, continued.** T5 (HTTP integration), T6 (RTL behaviour, which needs the "equivalent implementation" feature), T4 (async).

**Phase 5: React boundaries and forms.** R1, R3, R4, R2. Decide on React 19 *before* R5 and R6. My recommendation is to upgrade: pin `react@19`, rewrite the `forwardRef` guidance, and add `useActionState`/`useOptimistic` notes to `react-optimistic` and R3.

**Phase 6: Postgres features.** P1, P3, P2. Verify PGlite extension availability first (`btree_gist`, text-search configs).

**Phase 7: Node production.** N6, N8, N7, N9.

**Phase 8: JS and TS practice.** TS1 (and retype `ts-runtime-validator` / `ts-result` as real TS), TS2, TS3, J2, J1, J3.

**Phase 9: the `review` and `project` kinds.** C1, then X1. Then the progression changes (DAG, challenge-out, paths, refresh variants), which are easier to design once the catalogue is at its new size.

Then work through the "Should" rows in section 4 as time allows. Prefer the ones that fill a chapter to boss-worthy size.

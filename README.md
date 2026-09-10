# bootlocalopus

A local, gamified curriculum for going from **junior to mid-level** on the
JavaScript / TypeScript / React / Node / Postgres stack.

72 lessons, 6,785 XP, six tracks. No LeetCode, no algorithm puzzles, no
"reverse a binary tree" — every lesson is a thing you will actually be asked to
do at work, and every one is graded by running your code against real tooling.

```
npm install
npm start          # builds the UI and serves everything at http://localhost:4517
```

For development, with hot reload on both halves:

```
npm run dev        # API on :4517, UI on :5180
```

Progress lives in `data/progress.json`. Nothing leaves your machine; there is
no account, no telemetry, and no network call at runtime.

---

## What makes it different from a tutorial

**Your code actually runs.** Every lesson is graded in a sandboxed worker
thread against genuine tooling:

| Lesson kind | How it is graded | Count |
| --- | --- | --- |
| `js` | Your module is imported and exercised by a test suite | 15 |
| `ts` | Same, transpiled from TypeScript first | 2 |
| `typecheck` | **Real `tsc --strict`.** Zero diagnostics is the pass condition, and the spec asserts types with `Expect<Equal<…>>` plus `@ts-expect-error` | 10 |
| `react` | **jsdom + React DOM + Testing Library.** Components are rendered, clicked and re-rendered | 12 |
| `node` | **A real HTTP server** on a real port, hit with real `fetch`. Also streams, `node:crypto`, graceful shutdown | 11 |
| `sql` | **Real Postgres** (PGlite, compiled to WASM). Your DDL and queries run; constraints actually fire | 12 |
| `quiz` | Judgement calls that code cannot grade — code review, git, incidents, caching | 10 |

There is no "check my answer against a string" anywhere. If your rate limiter
leaks a token, or your `useEffect` lets a stale response win a race, or your
left join quietly drops the rows you were counting, the tests say so — with the
same kind of failure message you would get from a real test suite.

**The graders are adversarial on purpose.** They test the cases that separate
working code from correct code: the empty array, the cached `undefined`, the
promise that rejects after unmount, the duplicate timestamp on the pagination
boundary, the 4xx that must not be retried.

---

## The curriculum

| Track | Chapters | Lessons | XP | What it is for |
| --- | --- | --- | --- | --- |
| **JavaScript You Actually Need** | 4 | 15 | 1,370 | Closures, the event loop, real concurrency control, cancellation, immutability, error design |
| **TypeScript for Production** | 3 | 12 | 1,090 | Narrowing, discriminated unions, generics with constraints, `infer`, template literal types, `satisfies`, typed API surfaces |
| **React Patterns & Performance** | 3 | 12 | 1,160 | Derived state, reducers, custom hooks, effect cleanup and race conditions, compound components, accountable renders, accessibility |
| **Node & API Engineering** | 3 | 12 | 1,195 | HTTP without a framework, middleware, validation, error envelopes, signed tokens, rate limits, streams, graceful shutdown, layering |
| **Postgres & Data Modelling** | 3 | 13 | 1,260 | Constraints, normalisation, safe migrations, indexes, joins, window functions, recursive CTEs, upserts, N+1, keyset pagination |
| **Engineering Craft** | 2 | 8 | 710 | Code review, git with intent, debugging as a method, refactoring under test, caching, observability, scoping, incident response |

Each chapter ends in a **boss**: a bigger, multi-part build worth 3–5× a normal
lesson. The bosses are the things you would be given as a take-home:

- an `EventEmitter` with error isolation and safe mutation during emit
- a cancellable task queue with bounded concurrency and `AbortSignal`
- an API client with timeouts, selective retries and typed failures
- a fully typed `EventEmitter` where wrong arity is a compile error
- a sortable, filterable, paginated data table
- a notes API with auth, validation, error envelopes and pagination
- a monthly revenue report with CTEs, window functions and gap-filled months
- a 3am incident, worked through in order

### Progression

- The first lesson of **every** track is open, so you can start where your gap
  is rather than grinding chapter one.
- Within a chapter, lessons unlock one at a time.
- A chapter opens once **70%** of the previous one is done — one lesson you
  bounce off never walls off a whole chapter.

---

## The game layer

It is not stickers on a textbook; the economy is designed so the incentives
point at actually understanding things.

- **XP and levels.** Level *n* costs `100 + 50(n−1)` XP. Ranks run Junior I →
  Junior II → Junior III → Mid-Track → Mid I → Mid II → Mid III →
  Senior-Track.
- **Mid-level readiness.** One headline number: weighted completion across all
  six tracks. This is the actual goal.
- **First-try bonus (+25%) and combo.** Consecutive first-try passes build a
  multiplier up to ×1.25. A failed submit resets it. Reading the brief properly
  pays better than guessing.
- **Hints cost XP** (−12% each, floored at −50%), and revealing the reference
  solution caps the reward at 20%. Help is always available and never free.
- **Run vs Submit.** `Run` grades without consequences — no attempt counted, no
  combo lost. Only `Submit` scores. Experiment freely.
- **Streaks** with earned freezes (one per 5-day streak, max 3), so a missed
  day does not erase three weeks and the app never lies about the streak.
- **Daily quests**, seeded from the date so refreshing cannot reroll the board.
- **24 achievements**, including one secret. Badges are recomputed from
  progress rather than trusted, so editing the curriculum cannot strand one.

---

## Layout

```
content/          the curriculum: one file per track, plain TypeScript data
  types.ts        the lesson model
  AUTHORING.md    how to write a lesson
server/
  index.ts        the API
  content.ts      curriculum loading, unlock rules
  gamify.ts       XP, levels, ranks, streaks, quests, achievements (pure)
  progress.ts     the JSON save file
  runner/
    index.ts      spawns the sandbox, enforces the timeout
    worker.mjs    the sandbox: compile, environment per kind, test harness
web/src/          the React UI (hash routing, no router dependency)
scripts/          content verification and end-to-end checks
data/             your save file (gitignored)
```

### The sandbox

`server/runner/worker.mjs` is the interesting file. It runs learner code in a
worker thread, so an infinite loop or a top-level `throw` can be killed without
touching the API, and it builds the right environment per lesson kind: jsdom +
Testing Library for React, a PGlite instance seeded with the lesson's fixture
for SQL, a TypeScript `Program` for the type-level lessons.

It carries a hand-rolled test harness — `describe`/`it`/`expect` with about 25
matchers, deep equality, `.not`, `.rejects`, and hooks scoped per `describe` —
because pulling in a full test runner to grade a snippet costs more than it is
worth, and this way the failure messages are written for a learner rather than
for CI.

Two deliberate details worth knowing if you extend it:

- A ref'd heartbeat interval keeps the worker's event loop turning, because
  Node unref's the timer behind `AbortSignal.timeout()` and an unref'd timer
  alone never wakes a worker loop. Without it, any learner code awaiting
  `AbortSignal.timeout()` would hang until the parent killed it.
- Each SQL test runs inside a transaction that is rolled back, so a test that
  inserts rows cannot change what the next test sees. The learner's own SQL runs
  once before that, outside any transaction, so a lesson whose answer is DDL
  leaves its tables in place.

---

## Adding your own lessons

Lessons are data. Add one to a chapter's `lessons` array in
`content/<track>/index.ts` and it appears in the UI immediately — XP totals,
unlock rules, quests and achievements all follow automatically.

See [content/AUTHORING.md](content/AUTHORING.md) for the full guide, including
the globals available to a grader for each lesson kind.

Then check your work:

```bash
npm run verify              # every reference solution passes, every starter fails
npm run verify -- --track=sql   # one track
npm run lesson <lesson-id>  # run one lesson's reference solution, verbosely
```

`npm run verify` is the important one. It runs every lesson's reference solution
through the real grader and asserts it passes, then runs the **starter** code
and asserts it *fails* — a lesson whose starter already passes is a lesson that
teaches nothing.

---

## Checking the whole thing works

```bash
npm test              # typecheck + content lint + sandbox harness + all 72 reference solutions
npm run test:sandbox  # the grading sandbox itself: every kind, timeouts, compile errors
npm run test:api      # plays through lessons against a running server (resets progress!)
npm run test:ui       # mounts the real React app in jsdom and asserts every screen renders
npm run curriculum    # per-track lesson, XP and boss counts
```

`test:api` and `test:ui` need the server running (`npm run dev`), and `test:api`
resets your save file — run it before you have progress worth keeping.

---

## Choices worth explaining

**Why a JSON save file instead of Postgres?** So the app survives being copied
to a USB stick, and so there is no setup step between `npm install` and
learning. The Postgres track uses PGlite, which needs no server either.

**Why is the curriculum TypeScript rather than markdown files?** Because a
lesson is code plus prose plus a grader, and keeping them in one typed object
means a malformed lesson is a compile error instead of a runtime surprise.
`npm run verify` then proves every one of them actually works.

**Why no algorithm questions?** Because the gap between junior and mid is not
algorithmic. It is race conditions, error handling, schema design, knowing why
your component re-rendered, and being trusted to review someone else's change.
That is what this covers.

**The 740 KB bundle** is almost entirely CodeMirror. It is served from
localhost, so it costs nothing worth optimising.

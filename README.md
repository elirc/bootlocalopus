# bootlocalopus

A local, gamified curriculum for going from **junior to mid-level** on the
JavaScript / TypeScript / React / Node / Postgres stack.

508 lessons, 50,555 XP, nine tracks, 76 chapters. No LeetCode, no algorithm puzzles —
every lesson is a thing you will actually be asked to do at work, and every
one is graded by running your code against real tooling.

```
npm install
npm start          # builds the UI and serves everything at http://127.0.0.1:4517
```

For development, with hot reload on both halves:

```
npm run dev        # API on :4517, UI on :5180
```

Progress lives in `data/progress.json` (daily backups beside it). Nothing
leaves your machine: the server binds to loopback only, there is no account,
no telemetry, and no network call at runtime.

---

## What makes it different from a tutorial

**Your code actually runs.** Every lesson is graded in a sandboxed worker
thread against genuine tooling:

| Lesson kind | How it is graded | Count |
| --- | --- | --- |
| `js` / `ts` | Your module is imported and exercised by a test suite | 133 |
| `typecheck` | **Real `tsc --strict`.** Zero diagnostics is the pass condition; specs assert types with `Expect<Equal<…>>` and `@ts-expect-error` | 50 |
| `react` | **jsdom + React DOM + Testing Library.** Rendered, clicked, re-rendered, checked for ARIA and focus | 66 |
| `node` | **A real HTTP server** on a real port, hit with real `fetch`. Streams, `node:crypto`, `AsyncLocalStorage`, graceful shutdown | 94 |
| `sql` | **Real Postgres** (PGlite, compiled to WASM). DDL and queries run; constraints fire; `EXPLAIN` plans are inspected | 48 |
| `node-db` | Node code against that same real Postgres — parameterisation, transactions, locking, migrations | 19 |
| `mutation` | **You write the tests.** They must pass a correct implementation *and* a refactored equivalent, and catch every deliberately broken mutant | 34 |
| `quiz` | Judgement calls code cannot grade — code review (including real diffs), git, incidents, caching, design docs | 64 |

There is no "check my answer against a string" anywhere. If your rate limiter
leaks a token, your `useEffect` lets a stale response win a race, your cookie
lacks `SameSite`, or your left join quietly drops the rows you were counting,
the tests say so.

---

## The curriculum

| Track | Chapters | Lessons | XP | What it is for |
| --- | --- | --- | --- | --- |
| **JavaScript You Actually Need** | 11 | 71 | 6,760 | Closures, the event loop, concurrency control, cancellation, immutability, error design, dates across DST, safe regex; prototypes, proxies and private brands; ESM/CJS and the runtime; functional tools; async patterns (semaphores, single-flight, channels); collections; exact money, BigInt, Intl and Unicode |
| **TypeScript for Production** | 10 | 69 | 6,700 | Narrowing, discriminated unions, generics, `infer`, template literals, `satisfies`, schema inference, branded ids; `const` type params, `NoInfer`, overloads, variance; typing reducers, stores and module declarations; exhaustiveness and assertion functions; key paths and deep types; runtime boundaries; migrating a codebase to strict |
| **React Patterns & Performance** | 10 | 70 | 7,140 | Derived state, reducers, effect races, composition, error boundaries, XSS; hooks in depth; state management without a library (selectors, URL state, undo/redo); data fetching (SWR, dedupe, invalidation, Suspense); render performance and virtualisation; accessible widgets (menus, focus traps, trees); advanced forms |
| **Node & API Engineering** | 14 | 101 | 10,425 | HTTP without a framework, validation, errors, tokens, rate limits, streams, shutdown; files and CLIs; backpressure; ranges, compression, content negotiation; API design (cursors, idempotency, ETags, versioning); job queues, leases and the outbox; metrics, tracing, SLOs; sessions, JWT, RBAC, PKCE; path traversal, SSRF, uploads; retries, hedging, deadlines, load shedding |
| **Postgres & Data Modelling** | 11 | 72 | 7,170 | Constraints, migrations, indexes, joins, windows, recursive CTEs, upserts, N+1, keyset pagination, JSONB, `EXPLAIN`; audit triggers, tenancy, temporal data; anti-joins, `LATERAL`, gaps and islands; JSON API responses; locking, `SKIP LOCKED`, serialization retries; sargable queries, full-text search, statistics; migrations runners, batching, nested transactions |
| **Testing & Quality** | 6 | 43 | 4,425 | You write the suite, graded on whether it catches real bugs without pinning the implementation — unit, HTTP integration and React Testing Library, plus flake diagnosis, builders and contract tests |
| **Web Platform** | 3 | 27 | 2,560 | Fetch, CORS, cookies and HTTP caching from the browser's side; URLs, routing, storage, events, cancellation; Core Web Vitals, preloading, responsive images, performance budgets |
| **Software Design** | 3 | 28 | 2,745 | Strategy, observer, adapter, command and state machines as real features; module APIs, errors, plugins, deprecation; value objects, money allocation, aggregates, event sourcing |
| **Engineering Craft** | 4 | 27 | 2,630 | Code review, git, debugging, refactoring, incidents; feature-flag rollouts, semver and changelogs, CI linting, canaries; estimates, PR descriptions, incident updates, postmortems |

Most chapters end in a **boss** worth 3–5× a normal lesson — the kind of thing
you would be given as a take-home.

### Progression

- The first lesson of **every** track is open.
- **All but one.** A lesson opens when at most one lesson before it in its
  chapter is unpassed; a chapter opens when at most one lesson of the previous
  chapter is unpassed. Bosses can be skipped for unlocking but are required
  for the track badge and the top rank.

---

## The game layer

Redesigned after review found v1 rewarded guessing; the reasoning is in
`upskilling/journal/004-redesigning-the-economy.md`.

- **Run is free, Submit scores.** No attempt is counted for Run.
- **Clean bonus:** a pass with no hints and no reveal pays **+20%**. There is
  no first-try bonus and no combo.
- **Hints** cost `base × 0.5 / hintCount` each — all together cost half, none
  is free, the button shows the price. Revealing the solution caps the reward
  at 20%.
- **Rank comes from completion, not XP:** Junior I → II (10%) → III (25%) →
  Mid-Track (40% + a boss) → Mid I (55% + bosses in three tracks) → Mid II
  (70% + every track at half) → Mid III (85% + every boss) → **Mid-Level**
  (100%).
- **Levels** are a progress bar (`100 + 50(n−1)` XP each); finishing lands
  around level 45–49.
- **Streaks** with earned freezes spent automatically on a gap; **daily
  quests** drawn only from what you can reach; **27 achievements** (1,420 XP).
  What a pass was worth is frozen when it happens, so a hint opened afterwards
  never costs a badge.

---

## Layout

```
content/                        one folder per lesson, typed metadata per chapter
  AUTHORING.md                  how to write a lesson
  load.ts                       loader; validates every folder at startup
  <track>/track.ts
  <track>/<chapter>/chapter.ts
  <track>/<chapter>/<lesson-id>/   brief.md, starter.*, solution.*, tests.*, fixtures.sql
server/
  index.ts        lock, sweep, listen on loopback
  app.ts          the API — createApp({ store, runner, now }), testable in-process
  rewards.ts      what happens when something is earned
  projections.ts  read-only views for the client
  gamify.ts       economy, ranks, streaks, quests, achievements (pure; unit-tested)
  progress.ts     JSON save: fsync+rename, daily backups, quarantine, migrations, lock
  runner/         the sandbox
web/src/          React UI (hash routing, no router dependency)
scripts/          verify, e2e, UI smoke, mutation check, hooks
upskilling/       a mid→senior programme built on this codebase
```

### The sandbox

`server/runner/` treats the worker running learner code as **untrusted data**.
Results arrive on a private `MessageChannel` the learner cannot reach; the
parent derives the verdict from per-test rows; harness globals are locked and
builtins captured before learner code loads; an import policy denies
`worker_threads`, `vm`, `child_process`, `module` and files outside the run
directory. The learner's clock starts only once the environment (jsdom, PGlite,
the TypeScript program) is ready, and a failure that is the sandbox's fault is
never scored against you. See `upskilling/journal/005-*.md` for the reasoning.

---

## Adding lessons

```bash
npm run lesson <id>                 # run one lesson's reference, verbosely
npm run lesson <id> -- --starter
npm run verify -- --track=sql       # every reference passes, every starter fails fast
npm run verify -- --changed         # only lessons touched since HEAD
npm run mutate -- --lesson=<id>     # do the lesson's tests catch small breakages?
```

[content/AUTHORING.md](content/AUTHORING.md) is the full guide.

## Checking the whole thing works

```bash
npm test            # typecheck + economy unit tests + sandbox harness + all lessons
npm run test:api    # hermetic: starts its own server with a scratch DATA_DIR
npm run test:ui     # hermetic: mounts the real UI in jsdom and drives a pass
```

CI runs all of it on every push.

---

## Choices worth explaining

**JSON save, not a database** — so the app survives being copied to a USB
stick. Durability is ours to keep: fsync-then-rename, daily backups,
quarantine instead of overwrite on a parse failure, versioned migrations.

**Files on disk with typed metadata** — code should be code: highlighted,
diffable, no escaping. Everything TypeScript can check stays typed.

**No algorithm questions** — the junior→mid gap is race conditions, error
handling, schema design, knowing why a component re-rendered, writing a test
that fails for the right reason, and reviewing someone else's change.

**`upskilling/`** holds a mid→senior programme that uses this repository as
the vehicle, the adversarial reviews that shaped v2 (kept verbatim), and a
journal of what went wrong and what it taught.

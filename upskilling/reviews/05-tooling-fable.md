# Review 05 (adversarial) — Tooling, verification, repo hygiene

Reviewer: Fable · Target: `upskilling/reviews/05-tooling-opus.md` · Code was not modified.

All line references are to the committed state (`5def3f9`), the same basis Opus used. While this review ran, other sessions left uncommitted edits across `server/` and `web/` — including a per-pid `.runs` rewrite of `server/runner/index.ts` (F1 in flight) — so some cited lines will have moved by the time this is read. Nothing in this review depends on those edits.

Evidence: every file in scope was read in full (`package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `.gitattributes`, all seven scripts, `server/runner/index.ts`, `server/content.ts`, the head of `content/js/index.ts`, plus the relevant slices of `worker.mjs`, `server/index.ts` and `server/progress.ts`). Five throwaway scripts ran from the session scratchpad: a TS-parser escape counter, a `lint-content` probe, a content-stats script (quiz bias, XP bands, trailing newlines), a runner RSS/time sampler (serial and 4-way concurrent), a 21-mutant sample over six lessons, and a timing of 72 dynamic `lesson.ts` imports versus the current monolith. **Caveat, same as Opus's:** the machine (8 cores, 16 GB, ~1.4 GB free) was heavily loaded by other sessions throughout; a one-second `js` lesson took 7.3 s. Every absolute timing below is contaminated; only ratios and memory deltas are usable.

---

## Reliability verdict

**Opus's facts are reliable; two of its conclusions are not.** I checked 40-odd concrete claims (line numbers, counts, behaviours) and all but three line-number nits are correct: the sweep race mechanism, the `starter.ok`-only check, the four wall-clock asserts, the e2e reset, the ui-smoke order dependency, the tautology, the undeclared `esbuild`, the missing `engines`/`license`/`repository`, the quiz bias numbers (mine match exactly: 28/47 index-0, 42/47 longest), the 1,852 escaped backticks (exact match).

Where it is weak:

1. **F4 has no evidence.** Line 139 of the report is the literal placeholder `MUTATION_RESULTS`, and plan step 10 says "fix the survivors listed above" — nothing is listed. The claim "my mutation sample found surviving mutants" is unverifiable from the document. My own sample (below) found one real survivor in 16 conclusive mutants, so the *direction* is probably right, but the report should not be cited for it.
2. **The content-format loader is under-costed.** Opus's loader dynamically imports one `lesson.ts` per lesson. Measured: 72 dynamic `.ts` imports under tsx cost 0.8–3.9 s warm and 10–18 s cold, against 115–210 ms for the current monolith and 125–310 ms for reading JSON. That lands on every server start, every `npm run verify`, every `npm run lesson`. The folder layout is still right (see the decision section) but the metadata must not be 72 separately-transpiled TypeScript modules.
3. **F2 is overstated** ("`npm test` edits source"). `npm test` is `typecheck && lint:content && …`; an unescaped backtick makes `tsc` fail before the linter runs, so the rewrite only happens for an unescaped `${…}` that happens to typecheck. The split into check/fix is still right, but for a different reason: the fix mode corrupts *valid* code (see "What Opus missed" #3).
4. **One proposed fix is wrong as written.** The `process.exit` smoke case in F8 expects `errorMatch: /exited early|process\.exit/`. In the runner, `process.exit(0)` in learner code produces a worker exit with code 0, which `runner/index.ts:130–140` ignores; no message arrives and the run degrades into the 10 s "infinite loop" timeout. The case would fail, and the underlying runner hole was not reported.

Everything else in the plan is sound and the ordering is mostly sensible. My ordering differs at the end (see FINAL RECOMMENDED CHANGES).

---

## Per-finding verdicts

| # | Opus claim | Verdict | Evidence |
| --- | --- | --- | --- |
| F1 | `sweepRunsDir` deletes other processes' in-flight runs | **CONFIRMED** (mechanism) | `runner/index.ts:19` rm's the whole `.runs`; called at `server/index.ts:437`, `smoke.ts:123`, `verify-content.ts:86,94`. I did not reproduce the ENOENT, but the code cannot behave otherwise. Not stated by Opus: under `tsx watch` (`dev:api`) *every save of a server file* restarts the server and sweeps, so the race is routine in dev, not an edge case. Per-process dirs are the right fix; `verify`/`smoke` should then sweep only their own dir. |
| F2.1 | `npm test` rewrites source | **OVERSTATED** | `"test": "npm run typecheck && npm run lint:content && …"`. A stray backtick fails `tsc` first; only a typecheckable `${…}` reaches the rewrite. Still split check/fix. |
| F2.2 | `closesTemplate` misreads prose ending in `` `x`, `` | **CONFIRMED, and worse** | Probe reproduced Opus's mangling exactly. It also rewrites **valid** TS: `` `hello`.trim() `` → `` `hello\`.trim() `` and `` `x` + `y` `` → `` \`x\` + \`y` ``. Content has 0 such constructs today, which is the only reason the linter is "clean". A linter that can corrupt valid input should not be in `npm test` at all. |
| F2.3 | Consumed backslashes (`\d`, `\'`) undetected | **CONFIRMED** | `lint-content.mjs:58` skips any `\`+char pair. TS-parser count: 264 templates, 0 interpolations, 1,852 `` \` ``, 13 `\${`, **47** `\\` (Opus: 54; 29 are `\\n`, 6 `\\d`, 6 `\\/`, 2 `\\'`, 2 `\\s`, 2 `\\r`), 0 consumed. |
| F2.4 | File list hardcoded | **CONFIRMED** | `package.json` `lint:content`. |
| F3 | Starter may "fail" via timeout/compile/grader | **CONFIRMED** | `verify-content.ts:70` tests `starter.ok` only. `--track=typo` prints "Content is sound", exit 0 (lines 40, 84–87). Extra: starter is only run when the solution passed (`else if`, line 63) — one problem per lesson per run. |
| F4 | Surviving mutants found | **UNVERIFIABLE** | Report line 139 is the unreplaced placeholder `MUTATION_RESULTS`. My 21-mutant sample: 15 killed by tests, 5 "killed" by *timeout* (no evidence under load), 1 survived (`sql-constraints`: dropping `not null` from `published_year` still passes). Opus's design counts timeouts as kills; it must not. |
| F5 | Verify uses learner budgets; wall-clock asserts | **CONFIRMED, strongly** | Asserts at `js:750,952,1328`, `node:2299` as cited. My sampler with a 90 s budget: `sql-joins` 49.7 s (learner budget 25 s), `ts-narrowing` 62 s (budget 20 s), `react-controlled-form` 20.1 s (budget 20 s), and 1 of 4 concurrent typecheck runs exceeded even 90 s. A default-budget `verify` on this machine right now would report at least three false REFERENCE SOLUTION FAILS. |
| F6 | e2e/ui-smoke manual, destructive, order-dependent | **CONFIRMED, and worse** | `e2e.ts:38` reset; `progress.ts:11` hardcoded `DATA_DIR`; `ui-smoke.mjs:119,152,158` need e2e state; `:130` tautology; `esbuild` undeclared; `e2e.ts:224–294` duplicated solutions; `:159` "80%" vs `CHAPTER_UNLOCK_RATIO = 0.7`. Worse: `ui-smoke.mjs:151` `waitFor('.explain')` **throws** after 15 s on fresh data and the `catch` skips the Achievements, Stats and Dashboard sections entirely — `npm run test:ui` on a fresh checkout is a guaranteed failure, not a silent dependency. Also: `esbuild` resolves to **0.28.2 hoisted from `tsx` (`~0.28.0`)**, not vite's `^0.21.3`; Opus's "pin to the major vite uses" is the wrong pin. |
| F7 | Duplicate ids pass `npm test`; quiz bias; other static checks | **CONFIRMED** | `verify` imports `content/index.ts`; only `server/content.ts:25` throws. My numbers: 66 questions, 47 single-answer, correct index 0/1/2/3 = 28/16/2/1, longest-is-correct 42/47. XP bands and boss-last: clean today. README 72/6,785: matches. |
| F8 | smoke asserts only happy cases | **CONFIRMED** | `smoke.ts:119` derives expectations from label text. Missed: the "infinite loop is killed" case passes no `timeoutMs`, so **every `npm test` burns the full 10 s** on it. Opus's proposed `process.exit` case is **WRONG** (see verdict §4). |
| F9 | Serial, no cache; timings | Design **CONFIRMED**; timings **UNVERIFIABLE** | All of Opus's and my timings are load-contaminated. Memory (RSS delta in the parent, which hosts the workers): js +107 MB, node ~+200 MB, react ~+300 MB, typecheck +100–430 MB, sql +300 MB each when 4 run concurrently (+1.18 GB total), +800 MB for the first solo sql run (includes PGlite module load/WASM compile). Opus's `600 MB` divisor is about right; the `min(…, 4)` cap is right. |
| F10 | Duplication, exit codes, `.mjs` unchecked | **CONFIRMED** | `check()` at `e2e.ts:29` and `ui-smoke.mjs:75`; `debug-lesson.ts:32` always exits 0; `ui-smoke` `mkdtemp` never removed; no `allowJs`/`@ts-check`. |
| F11 | No CI, no hooks | **CONFIRMED** | No `.github/`, `.githooks/`, `.husky/`; `core.hooksPath` unset. |
| F12 | Config/hygiene nits | **CONFIRMED** | No `engines`/`license`/`repository`; `vite.config.ts:11` hardcodes `4517`; no `isolatedModules`; `progress.ts:95` writes `progress.json.tmp`, not ignored; `.gitattributes` lacks `*.wasm`; `AbortSignal.any` at `content/js:2075,2115` (Node ≥ 20.3). Nit: the `runUserSql()` doc comment is `types.ts:47`, not `:60`. |

Does `npm test` miss what Opus says it misses? Yes on all four: duplicate ids (only the server throws), `vite build` (not in `test`), e2e and ui (manual, need a server). It also misses everything in "What Opus missed" #1, #2, #6.

---

## Content format: decision

**Decision: migrate to one folder per lesson with real code files — but keep lesson metadata typed TypeScript at chapter granularity, not one `lesson.ts`/`lesson.json` per lesson.** Do it after the pipeline fixes and before the next batch of lessons.

### The numbers that decide it

- 264 template literals, 1,852 escaped backticks, 13 `\${`, 47 `\\`, 0 interpolations used anywhere. Authors are paying by hand for a feature (interpolation) nobody uses.
- Three real escaping bugs shipped. Trap 3 (`\d`, `\'`) is undetectable by the current linter and surfaces as an esbuild error far from the cause.
- `git rev-list --count HEAD` = **1**. There is no history to preserve; "blame/diff continuity" is not an argument against migrating.
- `web/` does not import `content/` (verified). No bundler learns anything.
- 50 of 62 `tests` fields end without a trailing newline; 0 starters do; 0 CRs; 0 trailing whitespace. Relevant to the round-trip check.
- `content/` is 12,724 lines inside the `tsc` include; most of that is string literal. After migration `tsc` sees only metadata.
- **Measured loader cost:** 72 dynamic `lesson.ts` imports under tsx = 767 ms warm (cleanest run; 3.9 s on a later, more loaded run), 10–18 s cold; monolith import 115–210 ms; JSON parse + read 125–310 ms. Opus's per-lesson `lesson.ts` design would multiply server/verify/lesson startup by 4–20×.

### Weighing, honestly

**Single builder, one session.** The migration is a script (~100 lines), a loader (~60 lines), a tsconfig exclude, one `tsx watch --include`, an AUTHORING rewrite, and deleting the linter. It produces no new lessons and consumes maybe two hours of a session including verification. It is the one item in the whole plan that can be deferred without any risk. But every lesson written *before* it is one more lesson to migrate, and every lesson written *after* it is free of the three traps and has editor support. If only one session exists, do F1–F3/F5–F6 first, migrate at the end; do **not** do the `code`-tag interim (below) as a stepping stone — it is throwaway work.

**Several agents in parallel.** This is where folders win outright. Agents editing template literals with a string-replace tool produce escaping bugs at a steady rate (the three shipped ones are almost certainly this). With folders, an agent edits `solution.js` as code. New lessons touch no shared file except a 5-line append to the chapter's metadata array; two agents appending to the *same chapter* get a trivial, obviously-resolvable conflict. With the current layout, two agents editing the same 2–3k-line track file conflict on anything.

| Axis | Current (6 track files) | Middle: per-chapter TS + `code` tag | Folders (this proposal) |
| --- | --- | --- | --- |
| Editor highlighting of code | none | none | full (`.js/.jsx/.ts/.sql/.md`) |
| Escaping traps | 1, 2, 3 | 1, 2 (3 removed by raw tag; 2 becomes a *type* error) | none |
| Diffability | string diffs in a 3k-line file | 700-line files | per-file code diffs |
| Merge conflicts (parallel adds) | same file, always | same chapter file | same chapter's 5-line array, or none |
| Typo safety | full TS | full TS | full TS for metadata; loader validates files (missing/extra/misnamed) |
| Loader complexity | 0 | 0 | ~60 lines, sync `fs` |
| `verify` speed | — | same | same (runtime-bound) |
| Startup cost | 115–210 ms | same | +~20 ms (290 sync reads) |
| Migration risk | — | low (sed + 47 unescapes) | moderate; provable by round-trip |

### The middle option, specified (so it can be rejected on the merits)

```ts
// content/types.ts
/** Raw template: backslashes are literal; `\`` and `\${` are the only escapes; interpolation is a type error. */
export const code = (s: TemplateStringsArray, ...subs: never[]) =>
  s.raw.join('').replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
```

Then `brief: code\`…\``, split each track file per chapter (~18 files), unescape the 47 `\\`. Cost: an hour. It removes trap 3 and makes trap 2 a compile error, but leaves 1,852 escaped backticks, leaves the linter, gives no highlighting, and still conflicts per chapter. Reject: it fixes the least-common trap and none of the parallel-authoring problems.

### Layout

```
content/
  types.ts                 # Lesson/Chapter/Track + defineLesson/defineChapter/defineTrack + loadChapter
  index.ts                 # unchanged export: tracks = [jsTrack, …]; also throws on duplicate ids
  js/
    track.ts               # defineTrack({ id, title, icon, color, weight, blurb, chapters: [closures, …] })
    closures/
      chapter.ts           # loadChapter(here, { id, title, summary, lessons: [ {id, title, kind, xp, why, tags, hints}, … ] })
      js-closure-state/    # folder name == lesson id
        brief.md
        starter.js
        solution.js
        tests.js
      js-event-loop/       # quiz: brief.md only; questions stay typed in chapter.ts
        brief.md
  sql/modelling/sql-constraints/   brief.md starter.sql solution.sql tests.js fixtures.sql
```

Why chapter-level metadata and not per-lesson: it is statically imported (no dynamic-import cost — this is the measured problem with Opus's design), fully typed, and it keeps order explicit (array order) so there are no `010-`/`020-` prefixes and no "both agents picked `060-`" collisions. Quizzes stay in `chapter.ts` because their 66 prompts are short single-quoted strings today (0 use template literals) and JSON would make them worse. If parallel same-chapter additions become the norm, per-lesson `lesson.json` + a 40-line validator is the fallback; do not use per-lesson `.ts`.

### Loader contract (sync, ~60 lines, in `content/types.ts` or `content/load.ts`)

```ts
const CODE_EXT = { js: 'js', ts: 'ts', typecheck: 'ts', react: 'jsx', node: 'js', sql: 'sql' } as const;
const TEST_EXT = { js: 'js', ts: 'js', typecheck: 'ts', react: 'jsx', node: 'js', sql: 'js' } as const;

export type LessonMeta = Omit<Lesson, 'brief' | 'starter' | 'solution' | 'tests' | 'fixtures'>;

export function loadChapter(dir: string, meta: Omit<Chapter, 'lessons'> & { lessons: LessonMeta[] }): Chapter {
  const fail = (m: string): never => { throw new Error(`content: ${meta.id}: ${m}`); };
  const lessons = meta.lessons.map((m) => {
    if (!/^[a-z0-9-]+$/.test(m.id)) fail(`${m.id}: id must be [a-z0-9-]`);
    const ldir = path.join(dir, m.id);
    if (!existsSync(ldir)) fail(`${m.id}: folder missing`);
    const left = new Set(readdirSync(ldir));
    const take = (name: string, required: boolean) => {
      if (!left.delete(name)) return required ? fail(`${m.id}/${name} missing`) : undefined;
      return readFileSync(path.join(ldir, name), 'utf8').replace(/\r\n/g, '\n');
    };
    const brief = take('brief.md', true)!;
    let lesson: Lesson;
    if (m.kind === 'quiz') lesson = { ...m, brief };
    else {
      const c = CODE_EXT[m.kind], t = TEST_EXT[m.kind];
      lesson = { ...m, brief, starter: take(`starter.${c}`, true), solution: take(`solution.${c}`, true),
                 tests: take(`tests.${t}`, true), fixtures: m.kind === 'sql' ? take('fixtures.sql', false) : undefined };
    }
    if (left.size) fail(`${m.id}: unexpected files ${[...left].join(', ')}`);   // catches solutoin.js, tests.ts for a js lesson, stray editor files
    return lesson;
  });
  for (const d of readdirSync(dir, { withFileTypes: true }))
    if (d.isDirectory() && !meta.lessons.some((l) => l.id === d.name)) fail(`folder ${d.name} has no lesson entry`);   // orphan guard
  return { ...meta, lessons };
}
```

Validation, all at import time so `npm test`'s first step (`tsc`) is followed immediately by the load in `lint`/`verify`:

- metadata typed by `defineChapter`/`LessonMeta` (unchanged safety for id/title/kind/xp/why/tags/hints/quiz);
- folder exists, exactly the required files for the kind, nothing extra, no orphan folders (the typo guards TS used to give);
- duplicate ids across all tracks: move the check from `server/content.ts:22–32` into `content/index.ts` so `verify` hits it (F7);
- keep `verify`'s `structural()` for quiz sanity, XP bands, boss-last, id prefix = track id.

Config: `tsconfig.json` `exclude: ["content/**/starter.ts", "content/**/solution.ts", "content/**/tests.ts"]` (only `typecheck` lessons produce `.ts` code files; `.js/.jsx/.sql/.md` are invisible to `tsc` without `allowJs`); `dev:api` gets `--include "content/**/*"`; `.editorconfig` with `insert_final_newline = true`; an optional `content/lesson-globals.d.ts` for editor autocomplete of `describe/expect/render/q/queryUser`.

### Migration, and the round-trip check

`scripts/migrate-content.ts`, run once:

1. `import { tracks as before } from '../content/index.ts'` (old). Snapshot with `structuredClone`.
2. Write the tree: for each track → `track.ts`; each chapter → `chapter.ts` (metadata via a small printer that emits single-quoted strings with `\'` and `\\` escaping only — or `JSON.stringify` per field, which is valid TS); each lesson → the files, **byte-exact**, no added trailing newline.
3. Swap `content/index.ts` to the new loader, `import { tracks as after }`.
4. `assert.deepStrictEqual(after, before)` — `node:assert` reports the first differing path.
5. Byte check independent of the loader: for every lesson and field, `readFileSync(file, 'utf8') === before[field]`.
6. Invariants: 72 lessons, 6,785 XP, kind histogram `{js:15, ts:2, typecheck:10, react:12, node:11, sql:12, quiz:10}`.
7. **The strongest proof, free once F9's cache exists:** populate `.cache/verify.json` with a full green run *before* the migration; after it, `npm run verify -- --changed` must run **zero** lessons. The cache key is `sha256(runnerHash, kind, starter, solution, tests, fixtures)` — zero misses is exactly "nothing the grader sees changed".
8. Then and only then delete the six monolith files, `lint-content.mjs`, and the escaping section of AUTHORING.md. Trailing newlines may be added afterwards by editors; that is semantically inert and `verify` proves it.

---

## Mutation check: minimal design

**Worth it, as a tool — not as a gate.** My sample: 21 mutants over 6 lessons in ~8 minutes on a loaded machine; 15 killed by tests, 5 killed only by *timeout* (inconclusive), 1 genuine survivor. The survivor is instructive: `sql-constraints` still passes with `not null` removed from `published_year`, so the brief's "every column is required" is not what the tests check. That is one real grader gap per ~16 conclusive mutants — enough signal to justify 100 lines, not enough to put in `npm test`.

**Expected false-positive (equivalent-mutant) rate** with the operators below: low, roughly 5–15%. `=== ↔ !==`, `return X → return undefined` and `&& ↔ ||` are almost never equivalent in code this small; `< ↔ <=` is equivalent only when the boundary is unreachable (rare in reference solutions); SQL keyword drops are equivalent only when a constraint is redundant with another (e.g. `primary key` already implies `not null`). Statement deletion is the operator with the high equivalent rate (defensive checks, `clearTimeout`, logging) — leave it out of the minimal version. Compile-failing mutants should be reported as `invalid`, not counted either way.

Minimal version:

- **Operators (5):** `rel` (`<`↔`<=`, `>`↔`>=`), `eq` (`===`↔`!==`), `logic` (`&&`↔`||`), `retundef` (`return X;` → `return undefined;`, JS/TS/node only), and for `sql`: `left join`→`join`, `desc`→`asc`, `>=`→`>`, drop `not null|unique|distinct`. Skip `typecheck` (needs `any`/constraint-drop operators; separate later) and `react` (regex mutants inside JSX mostly fail to compile → no signal).
- **Lessons:** default `--changed` (hash cache); `--lesson=<id>`; `--track=`; `--all`. Bosses first in `--all` since they carry the XP.
- **Budget:** ≤ 6 mutants per lesson, sampled evenly across candidates with a fixed seed (reproducible); `timeoutMs = 3 × learner budget`; `--jobs` shared with `verify`.
- **Verdicts:** `killed` = `!r.ok && !r.timedOut && !r.phase`; `invalid` = `r.phase` set (compile/load/grader); `inconclusive` = `timedOut`; `survived` = `r.ok`. Only `survived` is a finding; print `inconclusive` count so a loaded machine cannot fake a kill.
- **Report:** one line per survivor: `sql-constraints  L12  "not null" → ""  SURVIVED (all 6 tests passed)`; exit 1 if any survivor is not in `content/mutants-accepted.json`, keyed by lesson id and the **mutated line's text** (not its number, which shifts): `{ "js-once-memoize": [{ "line": "return result;", "op": "retundef", "why": "…" }] }`.
- Where it runs: `npm run mutate` locally on the lesson being written; weekly CI job with artifacts, never on `npm test`.

---

## Parallel verify: numbers

What actually bounds concurrency here, in order:

1. **Memory, dominated by sql.** RSS delta per worker (parent process hosts the workers): js ≈ 100 MB, node ≈ 200 MB, react ≈ 300 MB, typecheck 100–430 MB, sql ≈ 300 MB each under 4-way concurrency (+1.18 GB for four), and +800 MB for a first solo sql run. `resourceLimits.maxOldGenerationSizeMb: 512` is a cap, not a reservation. Four sql workers on a machine with 1.4 GB free (this one, now) swap; on the same machine quiet (~8 GB free) they are fine.
2. **Cores.** Each worker is single-threaded (PGlite WASM, `tsc`, jsdom), so N workers ≈ N busy cores plus the parent. 8 cores → N ≤ 6 in theory; leave two for the editor/server.
3. **Ports: not a limit.** Node lessons bind port 0; Windows' dynamic range here is 49152–65535 (16,384 ports); 11 node lessons × 2 runs × a handful of sockets is a few hundred. Even TIME_WAIT accumulation is irrelevant at this scale.
4. **`.runs` sweep (F1)** — must be fixed first or workers delete each other's `spec.mjs`.

**Default N:** `jobs = clamp(1, min(availableParallelism() − 2, floor(freemem() / 700 MB)), 4)`. On this box: quiet → 4, loaded as now → 2. `--jobs=N` overrides. When `jobs > 1`, `timeoutMs = 3 × budget`; **failures are re-run serially at 1× budget** so the learner-budget signal survives, and anything that passes only on the serial retry is reported `FLAKY`, anything whose serial time exceeds 50% of budget is reported `SLOW`. Order the queue sql → typecheck → react → node → js/ts (longest first). Solution and starter of one lesson are two independent jobs.

Expected effect on a quiet 8-core machine: the 24 sql runs (~10 s each serial) become ~60 s; typecheck/react similarly; total roughly a third of serial. I could not measure a clean number; neither could Opus. Measure once on a quiet machine before choosing the cap.

**`--changed` design.** Agree with Opus: a **content-hash cache** beats `git diff` locally — it survives uncommitted edits, branch switches and stashes, and a runner change invalidates everything by construction. `.cache/verify.json` (gitignored): `{ [lessonId]: { key, at } }`, `key = sha256(runnerHash ‖ kind ‖ starter ‖ solution ‖ tests ‖ fixtures)`, `runnerHash = sha256(worker.mjs ‖ runner/index.ts ‖ package-lock.json)`. Write an entry only when both the solution-passes and starter-fails checks are green. `--changed` skips lessons whose key matches; `--no-cache` forces. Add `--lesson=<id>`. In CI, restore `.cache/` with `actions/cache` keyed on `runnerHash`.

Where `git diff` *is* needed — the pre-commit hook and "which lessons did this PR touch" — the mapping is trivial after the folder migration: `git diff --cached --name-only -- content/` → `content/<track>/<chapter>/<lesson-id>/…` → id; a change to any `chapter.ts`/`track.ts`/`types.ts` or to the runner → all. With the current monolith it would need the TS AST to map a hunk's line range to the enclosing `id:`; not worth writing, because the hash cache already covers the hook (`verify --changed` after `git add` sees the staged content on disk).

---

## CI / hooks verdict

**Workflow: correct in shape; six corrections.**

1. Add `permissions: { contents: read }`.
2. Line endings on `windows-latest`: `actions/checkout` honours `.gitattributes` (`* text=auto eol=lf`, verified with `git check-attr`), which overrides the runner's `core.autocrlf=true`. Fine; keep the attributes file, it is doing real work.
3. Node matrix 22/24 is right: `AbortSignal.any` (`content/js:2075,2115`) needs ≥ 20.3; nothing needs 24. `engines: { node: ">=22" }` and a `.nvmrc`/`.node-version` of `24` (the author's runtime).
4. The steps assume F2 (`lint:content` check mode), F6 (`test:e2e` with `with-server.ts` and `BOOTLOCAL_DATA_DIR`), F9 (`--jobs`). Land those first or the workflow is red on day one.
5. GitHub-hosted runners are 4 vCPU / 16 GB (both OSes): `--jobs=3` is right; `VERIFY_TIMEOUT_SCALE=3` is right; `timeout-minutes: 30` is generous enough. Windows minutes bill at 2× on private repos; keep the Windows job to Node 24 only, as proposed.
6. `with-server.ts`'s free-port race is acceptable, but note the server logs the *configured* `PORT` (`server/index.ts:439–441`), so `PORT=0` cannot work until it logs `server.address().port`.

**Hooks without husky: works, with three real gotchas Opus did not mention.**

- **Exec bit.** This checkout has `core.fileMode=false` (verified). `git add .githooks/pre-commit` records mode `100644`; on macOS/Linux clones git then prints "hook was ignored because it's not set as executable" and **silently skips it**. Run `git update-index --chmod=+x .githooks/pre-commit` once and commit. Git for Windows itself runs the hook through its bundled `sh` regardless of the bit, which is why this is invisible to the author.
- **`prepare` must not fail `npm install`.** `execFileSync('git', …)` throws if git is not on PATH (CI images without git, a zip download) — wrap in try/catch, keep the `CI` and `.git` guards.
- **Hook duration.** `verify --changed` after a runner change is a full run (minutes) on every commit. Either cap it (`--changed --max=10`, warn and skip beyond) or keep the hook to `lint` + `verify --structural` (milliseconds) and let CI run the slow part. GUI git clients on macOS have a minimal PATH; the hook should `command -v npm >/dev/null || { echo "pre-commit: npm not on PATH, skipping"; exit 0; }` rather than block commits.

**`package.json`:** `engines`, `license`, `repository` are all absent (confirmed). `private: true` is set, so `"license": "UNLICENSED"` is consistent. One more that Opus missed and that matters for the README's "copy it to a USB stick": **`tsx` is a devDependency but `npm start` needs it** (`"start": "npm run build && tsx server/index.ts --prod"`), as does `vite`. `npm ci --omit=dev && npm start` fails. Either move `tsx`, `vite`, `@vitejs/plugin-react` to `dependencies` or stop pretending there is a production install.

---

## What Opus missed

1. **Runner hole: `process.exit(0)` hangs to timeout.** `runner/index.ts:130–140` only handles non-zero exit codes; a worker that exits 0 without posting sends nothing, so the run ends with "Timed out … An infinite loop …" after the full budget. The learner is told they wrote an infinite loop. Fix: treat any `exit` before `settled` as "exited early" regardless of code. Opus's own smoke case for this would fail against the current runner.
2. **`smoke.ts` wastes 10 s per `npm test`.** The "infinite loop is killed" case passes no `timeoutMs`, so it always waits the full js budget. `timeoutMs: 1500` gives the same regression coverage.
3. **`lint-content --fix` corrupts valid code.** `` `hello`.trim() `` and `` `x` + `y` `` are rewritten into broken TypeScript (probe output above). It is clean today only because no content uses those forms. That, not the check/fix split, is the reason it must leave `npm test`.
4. **`test:ui` on a fresh checkout is a guaranteed failure and skips half its checks.** `ui-smoke.mjs:151` throws after 15 s; the `catch` at `:181` abandons Achievements, Stats and the return-to-dashboard section. Plus seven hardcoded content numbers (`15` rows, `4` chapters, `18` options, `5` questions, `90 XP`, `24` badges, `56` heat days) that any edit to js chapter 1 breaks.
5. **`verify` reports one problem per lesson per run and hides the F5 signal.** The starter is only run if the solution passed (`:63`), and output is a single `.`/`F`/`S` with no per-lesson `ms`, so the slow lessons that will fail learners on laptops are invisible. There is no `--lesson=<id>` either; `debug-lesson` is the only single-lesson path and it always exits 0.
6. **Production install is impossible** (`tsx`/`vite` in devDependencies, needed by `start`). See CI/hooks.
7. **No code-style lint exists at all.** No eslint/prettier dependency, no `npm run lint`; Opus's F10 asks for `@ts-check` on `.mjs` but never notes the repo has zero style tooling. For a project meant to be authored by several agents, a formatter is the cheapest conflict-reducer there is.
8. **The loader in Opus's own recommendation is the slow part.** 72 dynamic `lesson.ts` imports: 0.8–3.9 s warm, 10–18 s cold, vs 115–210 ms today. See the decision section.
9. **`esbuild` is tsx's, not vite's.** Resolved at `0.28.2` (tsx `~0.28.0`), while vite wants `^0.21.3` and nests its own. Declaring `esbuild` "pinned to the major vite uses" would install a second, older copy for `ui-smoke`.
10. **`tsx watch` restarts sweep `.runs` on every server-file save** — F1's most frequent trigger in practice is the author's own dev loop, not a parallel `verify`.
11. **Mutation verdicts must exclude timeouts.** 5 of my 20 "kills" were timeouts under load; Opus's `r.ok === false ⇒ killed` would have counted them as evidence of grader strength.
12. **`RunResult.phase` is `string`.** F3's fix needs it to be the union `'fixture' | 'compile' | 'load' | 'grader' | 'sandbox'` (all four current values are in `worker.mjs:536–558`), or the check is stringly-typed.
13. Minor: `dist/` is correctly ignored and not committed (verified with `git ls-files`), `data/.gitkeep` is tracked at `100644` — Opus implies hygiene issues here that do not exist. The `progress.json.tmp` one is real.
14. Minor: shuffling quiz options server-side (F7) breaks `e2e.ts:207,214`, which hardcode answer indexes, and must be applied consistently to `/api/quiz/:id/explain`. Not a reason not to do it; a reason to do it with e2e in the same change.

---

## FINAL RECOMMENDED CHANGES

Ordered. Each is small enough to be one commit.

**MUST**

1. **Runner: per-process run dirs + sweep only dead owners** (F1), and **treat any worker `exit` before settle as "exited early"** regardless of code (missed #1). Tag ENOENT on the sandbox's own files as `phase: 'sandbox'`. Make `phase` a union type. This is the only change in the list that a learner can currently hit.
2. **`verify`: assert the starter fails *in tests*** — `!ok && !timedOut && phase === undefined && tests.some(!passed)`, with `typecheck` lessons exempt (diagnostics are the failure) — **fail when `--track`/`--lesson` matches nothing, always run the starter even when the solution failed, print per-lesson `ms`**, and add `--lesson=<id>`.
3. **`verify`: timeout scale (`×3` default when parallel, env override) + serial 1× retry + `FLAKY`/`SLOW` reporting.** Then fix the four wall-clock graders (`js:750,952,1328`, `node:2299`) to assert structurally (max in-flight counter, resolution order). Without this, CI is red on any busy runner — my sampler shows three reference solutions over budget right now.
4. **Split `lint:content` (check) from `fix:content`, discover files, and remove the character scanner from `npm test` entirely.** Until the migration lands, a 30-line TS-parser check (Opus's sketch is right) that only *reports* is safe; the current `--fix` can corrupt valid code.
5. **`smoke.ts`: declarative `expect` per case** (ok / timedOut / phase / errorMatch), `timeoutMs` on the infinite-loop case, and regression cases for the AbortSignal heartbeat, SQL rollback isolation, and `process.exit(0)` (which must expect "exited early", not a timeout, once #1 lands).
6. **`BOOTLOCAL_DATA_DIR`, `PORT=0` with the real port logged, `scripts/with-server.ts`, `test:e2e` = e2e then ui-smoke against a temp save file.** In the same change: e2e reads `lesson.solution`/`lesson.xp` from `content/`, ui-smoke reads counts from `/api/state` instead of literals, fix `:130` and `:159`, remove the temp dir, declare `esbuild` as `^0.28` (tsx's), and give both scripts a "is the server running?" message.
7. **Static checks in a `--structural` pass that runs first** (ms): duplicate ids (move the throw into `content/index.ts`), id charset + track prefix, XP bands, boss-last, quiz sanity, README numbers, wall-clock-assert warning, quiz position/length-bias warning.
8. **Content migration to per-lesson folders with chapter-level typed metadata**, via `scripts/migrate-content.ts` with the round-trip assertions in the decision section, gated by "`verify --changed` runs zero lessons after the move". Delete the monoliths, `lint-content.mjs` and AUTHORING's escaping section in the same commit. Do this before the next batch of lessons is authored.

**SHOULD**

9. **`--changed` hash cache and `--jobs` pool** with the default `clamp(1, min(cores − 2, freemem / 700 MB), 4)`, longest-first ordering, and `.cache/` gitignored. Populate the cache *before* step 8 so it doubles as the migration proof.
10. **CI workflow** as Opus proposed with the six corrections above (`permissions`, Node 22/24, Windows job on 24 only, steps ordered after 4/6/9 exist). **Hook:** `core.hooksPath` via a try/catch `prepare`, `git update-index --chmod=+x`, `npm`-on-PATH guard, and keep the hook to `lint` + `--structural` + a capped `verify --changed`.
11. **`package.json`:** `engines >=22`, `license: UNLICENSED`, `repository` when a remote exists, `.nvmrc` = 24, move `tsx`/`vite`/`@vitejs/plugin-react` to `dependencies` (or document that there is no `--omit=dev` install), `test:all`. **`.gitignore`:** `data/*` + `!data/.gitkeep`, `.cache/`, `*.tsbuildinfo`, `.env*`, `Thumbs.db`, `.DS_Store`. **`.gitattributes`:** `*.wasm binary`, `*.woff2 binary`, `package-lock.json -diff linguist-generated`. **`vite.config.ts`:** proxy target from `PORT`. **`tsconfig.json`:** `isolatedModules`, the content excludes from step 8, and `allowJs` + `@ts-check` for `worker.mjs`.
12. **`scripts/lib/report.ts`** (`check`, `section`, `waitFor`, `finish` setting `process.exitCode`), convert `ui-smoke.mjs` to `.ts`, and `debug-lesson`: exit `ok ? 0 : 1`, usage + nearest ids, `--file <path>`, print `phase`, and structured `{expected, actual}` on `toEqual`/`toStrictEqual`/`toMatchObject` so it (and later the UI) can show a diff.
13. **Add a formatter** (prettier, default config, `npm run fmt` + `fmt:check` in CI). Cheapest reducer of agent-vs-agent diff noise; do it right after the migration so it formats real code files, not template literals.

**COULD**

14. **`scripts/mutate.ts`** as specified in the mutation section (5 operators, ≤ 6 mutants/lesson, timeouts = inconclusive, accepted-mutants file keyed on line text), weekly in CI, `--changed` locally. Start by fixing the `sql-constraints` `published_year` survivor.
15. **Warm-worker reuse for reference runs only** (runner scope): PGlite boot and the jsdom/RTL import dominate sql/react run time; a per-kind warm worker for `verify` would beat any pool. Learner runs keep the fresh worker.
16. **Server-side quiz option shuffle** with a seed, applied consistently to submit and explain, with `e2e.ts` updated in the same change (missed #14).
17. Split `tsconfig.node.json` / `tsconfig.web.json` so server code stops seeing the DOM lib.

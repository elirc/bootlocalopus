# v3 authoring brief (shared by all 15 content agents)

Goal: grow the curriculum from 102 to ~500 lessons. You own **three chapters**,
already scaffolded (empty `lessons: []`) and registered in their `track.ts`.
Write **9 lessons per chapter (27 total; 8 is the floor)**, the last one in each
chapter a **boss**.

## Read first (in this order)

1. `README.md` — what the app is and the game rules.
2. `content/AUTHORING.md` — the lesson format, per-kind files, grader globals,
   the `mutation` and `node-db` kinds, and the style rules. **Follow it exactly.**
3. `content/types.ts`, `content/load.ts`.
4. Two existing chapters in your track as models (read their `chapter.ts` and
   at least two lesson folders each). For the new `web` and `design` tracks, use
   `content/js/errors/` and `content/node/production/` as models.
5. `scripts/smoke.ts` if you write `mutation` or `node-db` lessons — it has
   working examples of exactly what the sandbox supports.

Run `npx tsx scripts/curriculum-report.ts` and look at existing lesson ids in
your track (`ls content/<track>/*/`) — **do not duplicate an existing lesson's
topic**. If a topic in your chapter summary is already covered, pick a
neighbouring one.

## Quality bar (non-negotiable)

- **Junior→mid relevance.** Things a mid-level engineer on this stack is
  expected to do at work. No algorithm puzzles, no trivia.
- **At least 6 of 9 lessons per chapter are graded code** (`js`, `ts`,
  `typecheck`, `react`, `node`, `sql`, `node-db`, `mutation`). At most 3 quizzes.
  The `testing` track chapters are mostly `mutation`.
- **Briefs state precisely what the graders check**: exact function names and
  signatures, strings, statuses, shapes, error class names, policies for edge
  cases. A learner who follows the brief exactly must pass. Lead with the
  failure mode; name the trap.
- **Tests are adversarial and structural.** Cover the edge cases that separate
  working from correct. No wall-clock assertions (inject clocks/schedulers);
  no source greps (unless comments are stripped); every server closed in
  `finally`. Before you finish a lesson, try **at least one wrong-but-plausible
  solution** against it and confirm it fails.
- **Not over-constrained.** A correct, idiomatic alternative implementation
  must pass. Test behaviour, not structure.
- **Reference solutions are exemplary** — learners copy them.
- **Starters fail fast** (respond 501 / throw / return a wrong value), never hang.
- **Hints:** 3–5, progressive; the first does not give the answer away.
- **Quizzes:** 5–7 questions, distractors a competent engineer could pick,
  explanations that teach; vary the correct option's position; 2–6 options.
- **XP:** normal 60–110, boss 180–260.
- Every lesson has a one-line `why` and 2–4 `tags`.

## How to write without breaking everyone else

Fifteen agents share one `content/` tree, and **the loader throws if a chapter
folder has a lesson folder not listed in `chapter.ts` (or vice versa)** — which
makes every script fail for every agent. So:

1. Build each lesson in a folder named **`_draft-<lesson-id>/`** — the loader
   ignores `_draft-*` folders entirely.
2. Iterate on it with a scratch copy (see "Checking a draft" below).
3. To **publish**, do two steps back to back, nothing in between: rename
   `_draft-<id>` → `<id>`, then append the metadata entry to `chapter.ts`.
4. Only then run the official checks.

Your files: **only your three chapter directories.** Never edit `track.ts`,
`content/index.ts`, `types.ts`, `load.ts`, `server/`, `web/`, `scripts/`, or
any other chapter. If you think something outside your files needs changing,
say so in your final report instead.

If `content/index.ts` fails to load because of **another** chapter, wait 30–60 s
and retry — someone is mid-publish. Never "fix" another agent's files.

## Checking a lesson

- Published lesson: `npx tsx scripts/debug-lesson.ts <id>` (reference, must
  pass) and `npx tsx scripts/debug-lesson.ts <id> --starter` (must fail fast).
- Before publishing (draft): write a tiny scratch script in your scratchpad
  that imports `runExercise` from `server/runner/index.ts`, reads your draft
  folder's files, and runs them with `timeoutMs: 90000`. Also use it for your
  wrong-but-plausible probes.
- At the end: `npx tsx scripts/verify-content.ts --lesson=<id1>,<id2>,… --jobs=1`
  over all 27 of your lesson ids. It must print "Content is sound".

**The machine has 8 cores and ~2 GB free RAM, shared by 15 agents.** Never
run a full-track or full `npm run verify`, never use `--jobs` above 1, and run
at most one sandbox job at a time. If a run fails only by timeout or boot
timeout, it is load — rerun it; never weaken a test to dodge a timeout.

## Tooling traps

- The Bash tool's heredocs in this environment **eat backslashes**. Write every
  file with the Write tool; patch with Edit.
- Hint and quiz strings in `chapter.ts` are single-quoted: escape apostrophes
  as `\'`. Backticks are fine inside them.
- `toEqual` is type-tagged (a `Map` is not `{}`, two different `Error`s are not
  equal) and ignores `undefined`-valued keys; `toStrictEqual` is strict.
- Learner code cannot import `node:child_process`, `worker_threads`, `vm`,
  `module`. `node:fs`, `http`, `crypto`, `stream`, `async_hooks`, `zlib`,
  `readline`, `path`, `url` are fine. jsdom has no layout (no
  `IntersectionObserver`, no real sizes) — design React lessons accordingly.
- React is 18; tests use Testing Library globals with no jest-dom matchers.

## Final report (under 40 lines)

Lesson ids per chapter with kind and XP; the final `verify-content --lesson=…`
tail; the wrong-solution probes you ran and what they caught; anything you
could not do; anything outside your files you think needs changing.

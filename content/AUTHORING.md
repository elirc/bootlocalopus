# Writing a lesson

A lesson is a **folder of real files** plus a **few lines of typed metadata** in
its chapter's `chapter.ts`. Code is code (highlighted, linted by your editor,
diffable), prose is Markdown, and everything that TypeScript can check — ids,
kinds, XP, hints, quiz answers — stays typed.

## Layout

```
content/
  types.ts                  Lesson / Chapter / Track / QuizQuestion / Mutant
  load.ts                   loadChapter() + defineTrack() + the validation below
  index.ts                  tracks = [js, ts, react, node, sql, craft]; throws on duplicate ids
  js/
    track.ts                defineTrack({ id, title, icon, color, weight, blurb, chapters: [closures, …] })
    closures/
      chapter.ts            loadChapter(here, { id, title, summary, lessons: [ {…metadata…}, … ] })
      js-closure-state/     folder name == lesson id
        brief.md
        starter.js
        solution.js
        tests.js
      js-event-loop/        a quiz: brief.md only; its questions live in chapter.ts
        brief.md
  sql/modelling/sql-constraints/
        brief.md  starter.sql  solution.sql  tests.js  fixtures.sql
```

Lesson order is the order of the `lessons` array in `chapter.ts`; chapter order
is the `chapters` array in `track.ts`; track order is `content/index.ts`. There
are no numeric prefixes on folders.

### Files per kind

| `kind` | starter / solution | tests | extra |
| --- | --- | --- | --- |
| `js`, `node` | `.js` | `tests.js` | |
| `ts` | `.ts` | `tests.js` | |
| `typecheck` | `.ts` | `tests.ts` (the spec) | |
| `react` | `.jsx` | `tests.js` (JSX is allowed in it) | |
| `sql` | `.sql` | `tests.js` | `fixtures.sql` (optional) |
| `node-db` | `.js` | `tests.js` | `fixtures.sql` (optional) |
| `quiz` | — | — | questions in `chapter.ts` |
| `mutation` | `.js` — the learner's **test file** | none | `subject`, `mutants/`, `equivalents/` (`.jsx` when `subjectKind: 'react'`, else `.js`) |

Every lesson has `brief.md`. Nothing else is allowed in the folder.

### The metadata

`chapter.ts` carries everything that is not a file, typed as `LessonMeta`
(`Lesson` minus the file fields):

```ts
{
  id: 'js-my-lesson',        // == folder name; [a-z0-9-]; globally unique; URL is #/lesson/<id>
  title: 'Something specific',
  kind: 'js',                // js | ts | typecheck | react | node | sql | quiz | mutation
  xp: 70,                    // 50-100 for a normal lesson, 180-260 for a boss
  boss: true,                // optional; chapter finales
  why: 'One line on why a mid-level engineer needs this.',
  tags: ['closures', 'async'],
  hints: ['Progressive, each one more specific than the last.'],
  // quiz: [{ q, options, answer, explain }, …]   for kind: 'quiz'
  // mutants: [{ slug, label }, …]                for kind: 'mutation'
},
```

Hints and quiz questions are ordinary single-quoted strings. Backticks inside
them are fine (they render as inline code); an apostrophe is `\'`.

## Adding a lesson

1. Create the folder `content/<track>/<chapter>/<lesson-id>/` with `brief.md`
   and the files for its kind (table above).
2. Append its metadata object to the chapter's `lessons` array in `chapter.ts`
   (about five lines, plus hints).
3. `npm run lesson <lesson-id>` to see every test against the reference, and
   `npm run lesson <lesson-id> -- --starter` to see the starter fail.
4. `npm run verify -- --track=<track>`.

Nothing else changes: no shared file besides the chapter's array, so two
people adding lessons to different chapters never conflict.

## What the loader checks

`content/load.ts` validates at import time — the server, `verify`, and every
script that imports `content/index.ts` refuse to start on a broken tree:

- every id (lesson and chapter) matches `[a-z0-9-]+`;
- every metadata entry has a folder of the **same name**;
- the folder holds **exactly** the required files for its kind: a missing file,
  a misspelt one (`solutoin.js`), the wrong extension (`tests.ts` on a `js`
  lesson) or a stray editor file is an error naming the lesson;
- every folder in a chapter directory has a metadata entry (no orphans);
- `content/index.ts` throws on a duplicate lesson id across all tracks.

Files are read as UTF-8 with `\r\n` normalised to `\n`, so a Windows checkout
or editor grades identically. Files are otherwise used byte-for-byte: a
trailing newline is harmless either way.

`npm run verify` then adds the behavioural rules:

1. The **reference solution passes**. Non-negotiable: it is the answer you
   reveal to learners.
2. The **starter fails**. A starter that already passes teaches nothing.
3. Structure: a non-empty brief, a `why`, positive XP, and for code lessons —
   tests, a solution, a starter and at least one hint.
4. For quizzes: every question has at least one correct answer, no answer index
   out of range, no duplicate options, and an explanation on every question.

Run it per track while iterating: `npm run verify -- --track=react`.
To see one lesson's full output: `npm run lesson js-map-limit`
(add `--starter` to run the starter instead).

In `npm run dev` the API restarts when anything under `content/` changes.

## What a grader can use

Every lesson kind gets `describe`, `it`/`test`, `beforeEach`, `afterEach`
(scoped to their `describe`), `expect`, `assert(cond, msg)`, `fail(msg)` and
`num(value)` (forces Postgres `bigint`/string numerics to a number).

`expect` supports: `toBe`, `toEqual`, `toStrictEqual`, `toMatchObject`,
`toBeTruthy`, `toBeFalsy`, `toBeNull`, `toBeUndefined`, `toBeDefined`,
`toBeNaN`, `toBeTypeOf`, `toBeInstanceOf`, `toContain`, `toContainEqual`,
`toHaveLength`, `toHaveProperty`, `toBeGreaterThan(OrEqual)`,
`toBeLessThan(OrEqual)`, `toBeCloseTo`, `toMatch`, `toThrow`, plus `.not.*` and
`.rejects.toThrow` / `.resolves.toBe|toEqual`.

Prefer **structural** assertions to wall-clock ones. "At most 2 in flight",
"task 3 started before task 1 finished" and "resolved in this order" hold on a
loaded laptop; "took under 100 ms" does not. If you must measure time, compare
two measurements (a ratio), never an absolute threshold.

Do not grep the learner's source (`toString()`, `userSql`) unless there is no
behavioural alternative — a comment containing the forbidden word fails a
correct answer. If you must, strip comments first.

### `js` · `ts` · `node`

`solution` is the learner's module namespace.

```js
it('adds', () => { expect(solution.add(2, 3)).toBe(5); });
```

`node` lessons can start real servers — bind to port 0 and close them in a
`finally`. Node's global `fetch` is available. `AbortSignal.timeout()` works
(the sandbox keeps its event loop alive so the timer fires).

### `typecheck`

Graded by the TypeScript compiler at `--strict`; the pass condition is zero
diagnostics. `solution.ts` is the learner's code and `tests.ts` becomes
`spec.ts`, which can `import { X } from './solution'`. These helpers are
injected:

```ts
type Equal<A, B>       // exact type equality
type Expect<T extends true>
type ExpectFalse<T extends false>
type IsAny<T>
```

Assert both directions — that the right things typecheck, and that the wrong
things do not:

```ts
type _ok = Expect<Equal<ReturnType<typeof f>, string>>;
// @ts-expect-error not a key of User
pluck(users, 'nope');
```

`@ts-expect-error` is the sharpest tool here: if the next line *stops* being an
error, the compiler reports the unused directive and the lesson fails. That is
how you pin down an API that must reject misuse.

Beware: a conditional type over a bare type parameter distributes over unions,
and `boolean` is `true | false`. Compare `[T] extends [U]` when you do not want
that. And TypeScript ≥ 5.5 infers type predicates for simple guards
(`(x) => typeof x === 'string'`), so a spec cannot tell whether the learner
wrote `x is string` on one.

These `.ts` files are excluded from the project's own `tsc` run
(`tsconfig.json`), because the spec's `Equal`/`Expect` helpers only exist in
the sandbox and starters are deliberately wrong.

### `react`

jsdom is set up before the learner's module loads. Globals: `React`, `render`,
`screen`, `fireEvent`, `waitFor`, `act`, `within`, `renderHook`, `cleanup`
(cleanup runs automatically after each test).

```jsx
it('increments', () => {
  render(<solution.Counter />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button').textContent).toBe('count: 1');
});
```

There are **no jest-dom matchers** — assert on the DOM directly
(`el.textContent`, `el.value`, `el.disabled`, `getAttribute`,
`document.activeElement`), and use `expect(screen.queryByText('x')).toBeNull()`
for absence.

Traps that cost real time when writing these:

- `getByText` throws if it matches more than one element, and a parent plus its
  button both match their shared text. Prefer `getAllByRole(...)` then assert
  on `textContent`.
- Object-spreading a value that exposes getters (`{ ...app }`) freezes them at
  their current value. Delegate instead.
- React 18 no longer warns about setState after unmount, so "no warning was
  logged" proves nothing about cleanup. Assert the effect's observable result
  (an abort, a timer that did not fire) instead.
- Reference solutions are exemplars: a callback prop in an effect's dependency
  array re-runs the effect on every parent render. Hold such props in a ref.

### `sql`

A fresh PGlite (real Postgres, WASM) instance per run. `fixtures.sql` is
executed first, then the learner's SQL. Globals:

| Global | What it does |
| --- | --- |
| `db` | the PGlite instance |
| `userSql` | the learner's SQL as text |
| `execUser()` | runs the learner's SQL (memoised), returning every statement's result |
| `queryUser()` | rows from the **last** statement of the learner's SQL |
| `q(sql, params)` | a query the grader runs itself, for setup or inspection |

Each test runs in a transaction that is rolled back, so tests are independent.
The learner's SQL runs once before that, outside any transaction, so a DDL
lesson leaves its tables in place for every test.

Consequences to write around:

- **Sequences are not transactional.** A rolled-back insert still advances the
  id, so never hardcode `id = 1` — capture it with `returning id`.
- A failed statement aborts the transaction, so everything after it in the same
  test errors too. Assert one rejection per test where it matters.
- The learner's SQL is one multi-statement `exec`, i.e. one implicit
  transaction, so `CREATE INDEX CONCURRENTLY` cannot run.
- Order that matters must be total: add a unique tiebreaker to every
  `order by` (and every window's `order by`) a test depends on.

Money in the existing content is stored in **integer cents**, which keeps
`numeric`-versus-float serialisation out of the way. Several lessons share the
same shop schema; each keeps its own copy in `fixtures.sql`.

### `quiz`

No code files. Each question in `chapter.ts` is `{ q, options, answer,
explain }`, where `answer` is an array of correct indexes — more than one makes
it multi-select, and the UI switches to checkboxes and shows "Select all that
apply". All questions must be right to pass; explanations are shown once
passed.

Write options that a competent person could plausibly pick. Four options where
three are obviously silly tests nothing. The explanation is the actual lesson —
say *why*, and what the failure mode looks like in production.

### `mutation`

The learner writes the **tests**; the grader runs them against a correct
implementation, which must pass, and against broken variants, each of which
must fail.

```
content/<track>/<chapter>/test-my-lesson/
  brief.md
  starter.js            the learner's test file as the editor opens it
  solution.js           a reference test file that passes the rules below
  subject.js            the correct implementation the tests import
  mutants/
    1-off-by-one.js     mutants/<n>-<slug>.js — n is its 1-based position
    2-skips-empty.js
  equivalents/          optional
    1.js                behaves exactly like subject.js, written differently
```

```ts
{
  id: 'test-my-lesson', kind: 'mutation', xp: 90, …,
  mutants: [
    { slug: 'off-by-one', label: 'Includes the end index' },
    { slug: 'skips-empty', label: 'Returns undefined for an empty list' },
  ],
}
```

The loader pairs `mutants[i]` with `mutants/<i+1>-<slug>.js` and produces
`Lesson.mutants = [{ label, code }]`; the label is what the learner sees when
their tests let that mutant survive. `equivalents/1.js, 2.js, …` (contiguous)
become `Lesson.equivalents`. With `subjectKind: 'react'` the subject, mutants and
equivalents are `.jsx` files. A test that fails an equivalent is testing
implementation details (a CSS class instead of a role), not behaviour. There is
no `tests` file.

## Style notes for the prose

The briefs in this curriculum follow a shape worth keeping:

1. **Lead with the failure**, not the feature. "`await` in a loop is
   sequential; ten 100ms calls become a second" beats "this lesson covers
   `Promise.all`".
2. **State the task precisely**, including the exact strings, statuses and
   shapes the graders check. Ambiguity in a brief is a bug, because the tests
   are the real specification and the learner cannot see them.
3. **Name the trap.** If there is a reason the obvious approach fails a test —
   batching instead of a worker pool, a `where` clause that turns a left join
   into an inner one — say so in the brief or the hints rather than letting it
   be a gotcha.
4. **Hints get progressively more specific**, and the last one is close to
   giving away the shape. Hints cost XP; a hint that does not help is a tax.

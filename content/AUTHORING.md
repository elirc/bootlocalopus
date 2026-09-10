# Writing a lesson

A lesson is one object in a chapter's `lessons` array. Add it, run
`npm run verify`, and it appears in the UI with XP, unlocking and achievements
already wired up.

```ts
{
  id: 'js-my-lesson',        // globally unique; the URL is #/lesson/<id>
  title: 'Something specific',
  kind: 'js',                // js | ts | typecheck | react | node | sql | quiz
  xp: 70,                    // 50-100 for a normal lesson, 180-260 for a boss
  boss: true,                // optional; chapter finales
  why: 'One line on why a mid-level engineer needs this.',
  tags: ['closures', 'async'],
  brief: `Markdown. Concept first, then a "## Task" section.`,
  starter: `// the code the editor opens with — it MUST fail the tests`,
  solution: `// a reference solution that MUST pass`,
  hints: ['Progressive, each one more specific than the last.'],
  tests: `it('does the thing', () => { expect(solution.thing()).toBe(1); });`,
}
```

## The rules that `npm run verify` enforces

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
diagnostics. `code` becomes `solution.ts` and `tests` becomes `spec.ts`, which
can `import { X } from './solution'`. These helpers are injected:

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
that.

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

Two traps that cost real time when writing these:

- `getByText` throws if it matches more than one element, and a parent plus its
  button both match their shared text. Prefer `getAllByRole(...)` then assert
  on `textContent`.
- Object-spreading a value that exposes getters (`{ ...app }`) freezes them at
  their current value. Delegate instead.

### `sql`

A fresh PGlite (real Postgres, WASM) instance per run. `fixtures` is executed
first, then the learner's SQL. Globals:

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

Two consequences to write around:

- **Sequences are not transactional.** A rolled-back insert still advances the
  id, so never hardcode `id = 1` — capture it with `returning id`.
- A failed statement aborts the transaction, so everything after it in the same
  test errors too. Assert one rejection per test where it matters.

Money in the existing content is stored in **integer cents**, which keeps
`numeric`-versus-float serialisation out of the way.

### `quiz`

No code. Each question is `{ q, options, answer, explain }`, where `answer` is
an array of correct indexes — more than one makes it multi-select, and the UI
switches to checkboxes and shows "Select all that apply". All questions must be
right to pass; explanations are shown on failure and unlocked permanently once
passed.

Write options that a competent person could plausibly pick. Four options where
three are obviously silly tests nothing. The explanation is the actual lesson —
say *why*, and what the failure mode looks like in production.

## Escaping, which is the only tedious part

Lesson content is embedded in TypeScript template literals, so inside a
`brief`, `starter`, `solution` or `tests` string:

- a literal backtick must be `` \` ``
- a literal `${` must be `\${`
- inside a template literal, an apostrophe in emitted JS needs `\\'`, because
  one backslash is consumed by the template literal itself

`npm run lint:content` finds and fixes the first two automatically. The third
shows up as a confusing esbuild error a long way from the actual line — the
simplest fix is to rephrase and avoid the apostrophe.

Hint strings are ordinary single-quoted strings, where an apostrophe is `\'`
and backticks are fine unescaped.

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

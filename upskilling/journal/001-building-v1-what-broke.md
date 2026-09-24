# 001 — Building v1: what broke, and what each break taught

*2026-09-09 · Journal entry. Format: context → what happened → root cause → the senior-level lesson → what I'd do differently.*

This project was built in one long session, from an empty folder to 72 graded
lessons with a verified pipeline. The interesting part is not what went right.
It is the eleven things that broke — every one of them a bug a mid-level
engineer would ship and a senior would have a reflex against. They are recorded
here in the order they happened, because the order is itself instructive: the
early bugs were in the sandbox, the later ones were in *my own tests*.

---

## 1. `AbortSignal.timeout()` never fires inside a worker thread

**Context.** The grading sandbox runs learner code in a `worker_thread`. A boss
lesson's reference solution used `AbortSignal.timeout(ms)` for a per-attempt
request timeout — a perfectly idiomatic choice.

**What happened.** The reference solution hung until the parent killed it. Not
a slow test; a hang, every time, with no error.

**Root cause.** Node implements `AbortSignal.timeout()` with an *unref'd*
timer so that a pending timeout never keeps a process alive. In the main
thread that is invisible, because something else always keeps the loop
running. In a worker with nothing else scheduled, an unref'd timer never
causes libuv to wake — the loop parks in `poll` forever. Ten lines of
experiment confirmed it: a ref'd `setInterval(() => {}, 20)` alongside makes
the signal fire on time.

**Lesson.** "Idiomatic" and "works in my environment" are not the same claim.
Runtime primitives carry hidden assumptions about the host — here, that
*something* refs the loop. The fix (a heartbeat interval in the sandbox) is
three lines; the *diagnosis* is the skill. The technique that found it: strip
everything away until you have a ten-line reproduction, then vary one thing.

**Do differently.** Test the sandbox against the runtime's async primitives
*before* writing content that depends on them. A `smoke.ts` case for
`AbortSignal.timeout` would have caught it in minute ten instead of hour two.

---

## 2. A timeout that couldn't say what timed out

**Context.** The first timeout error message was generic: "Timed out after
10s". Diagnosing bug #1 with it was guesswork.

**Root cause.** The worker only reported at the end of the run. When it was
killed, all per-test state died with it.

**Lesson.** Observability is a feature you build *before* you need it. The fix
— the worker posts a `{ progress: testName }` message before each test, so a
timeout can name the test in flight — cost five minutes and immediately turned
the next hang from a mystery into a line number. Every "we'll add logging when
we need it" is a bet that you'll be lucky at 3am.

---

## 3. The bash heredoc that ate backslashes

**Context.** Content files embed code in TypeScript template literals. I was
patching them with Python scripts fed through bash heredocs.

**What happened.** Patches that looked right produced files with missing
backslashes. A regex `\\d` became `\d`; a `\\'` became `\'`. Three separate
"fixes" made things worse before I noticed the pattern.

**Root cause.** The tool's heredoc handling was consuming backslashes — the
exact escaping layer I was relying on. I kept theorising about TypeScript's
escaping rules when the corruption was happening one layer *below*.

**Lesson.** When a fix doesn't behave, question the pipe before the payload.
Debugging is a stack of layers, and the layer you're staring at is usually not
the one that's lying. The moment I `repr()`-printed the bytes on disk instead
of reasoning about what they *should* be, the problem was obvious.

**Do differently.** Write files with a tool that has no escaping layer (a
direct file write), and when patching, assert on the bytes afterwards.

---

## 4. A linter that corrupted the thing it was linting

**Context.** After the escaping bugs I wrote a content linter to auto-escape
raw backticks inside template literals. It worked. Then I extended it to also
fix "bare apostrophes inside single-quoted strings", using the heuristic "the
last quote on the line closes the string."

**What happened.** It rewrote `tags: ['closures', 'encapsulation']` into
`tags: ['closures\', \'encapsulation']` — 144 string boundaries across five
files, in one run, with no backup.

**Root cause.** The heuristic was unsound for any line holding two strings.
I had tested it on the case I was fixing and not on the cases it would meet.

**Lesson.** An auto-fixer needs a *sound* rule, not a plausible one. "Escape a
backtick that isn't a template terminator" is sound because a terminator has
a precise definition. "Escape a quote that isn't the last one on the line" is
a guess. When you cannot state the rule precisely, the tool should *report*,
not *rewrite* — and esbuild already reported unterminated strings accurately,
so the rewrite bought nothing. Also: a tool that mutates 5 files should dry-run
by default.

**Do differently.** I reverted the damage mechanically (the corruption had a
unique signature, `\', \'`) and deleted the quote logic from the linter. The
linter now does one thing it can do correctly.

---

## 5. Distributive conditional types and `boolean`

**Context.** A TypeScript lesson: `Flatten<T>` should unwrap one level of
array nesting. `Flatten<readonly boolean[]>` came back as
`(readonly false[] & readonly boolean[]) | (readonly true[] & readonly boolean[])`.

**Root cause.** A conditional type over a bare type parameter *distributes*
over unions, and `boolean` is secretly `true | false`. The fix is the tuple
wrap: `[E] extends [readonly unknown[]]`.

**Lesson.** This one became curriculum: the hint and brief for that lesson now
teach the trap explicitly, because I hit it myself while writing the reference
solution. The best lesson content comes from bugs the author actually made.

---

## 6. `getByText` and the element that matched twice

**Context.** React lesson tests using Testing Library.

**What happened.** `screen.getByText(/beta/)` threw "found multiple elements"
— the `<li>` and the `<button>Select beta</button>` inside it both matched.
`getByText(/\$19\.98/)` matched both the line item and the total.

**Lesson.** A test's query must be as precise as the assertion. Text regexes
across a tree are ambiguous by construction; role-based queries plus
`textContent` assertions are not. This is why real teams have Testing Library
conventions — the failure mode is subtle enough that everyone hits it once.

---

## 7. Object spread froze the getters

**Context.** A test helper did `return { ...app, get: fetchHelper }` where
`app` exposed `activeRequests` and `isShuttingDown` as getters.

**What happened.** Every getter read `0`/`false` forever. A 5-second timeout in
a test that should have taken 40ms.

**Root cause.** Spread *evaluates* getters at spread time and copies the
values. The live view was gone. Delegating (`get activeRequests() { return
app.activeRequests }`) fixes it.

**Lesson.** Spread is not "copy the object." It is "enumerate own enumerable
properties and copy their *current values*." Getters, symbols, prototypes and
non-enumerables all behave differently. A senior knows which of those matter
in the object at hand.

---

## 8. You cannot send a 503 after `server.close()`

**Context.** The graceful-shutdown lesson originally specified: on shutdown,
close the listener, and answer new requests with 503 while draining.

**What happened.** The test for "new requests get 503" got a connection error
instead.

**Root cause.** `server.close()` stops *accepting*. A new connection is refused
at the TCP level; it never reaches the handler that would send the 503. The
503 path is only reachable over an already-open keep-alive connection.

**Lesson.** The bug was in the *lesson design*, not the code — the spec
described something impossible. The rewrite teaches what real deployments do:
two phases. First mark unhealthy and return 503 *while still listening* so
the load balancer deregisters you; *then* close and drain. The lesson got
better because the first version was wrong, and the test told me so.

**Do differently.** When a test fails against a reference solution, consider
that the *specification* may be the bug before assuming the code is.

---

## 9. `beforeEach` that applied to every test in the file

**Context.** The hand-rolled harness collected `beforeEach` hooks into one
flat array.

**What happened.** SQL lessons where a nested `describe` inserted a fixture
row in `beforeEach` failed with duplicate-key errors — the insert ran before
*every* test in the file, including ones in other suites.

**Root cause.** Hooks must be scoped to the `describe` that declares them.
Every real runner does this; mine didn't, and the simplification was invisible
until a lesson needed it.

**Lesson.** When you reimplement a well-known tool "just the parts you need,"
list the semantics you are dropping *explicitly*. Scoped hooks were not a nice-
to-have; they were load-bearing for correctness. The fix is a suite stack with
outermost-first setup and innermost-first teardown.

---

## 10. Sequences are not transactional

**Context.** After adding per-test transaction rollback for SQL lessons, tests
that hardcoded `author_id = 1` started failing with foreign-key violations.

**Root cause.** Rolling back an `INSERT` does not roll back the sequence it
consumed. Test N's author was id N, not 1. This is documented Postgres
behaviour and every ORM test suite eventually meets it.

**Lesson.** Isolation via rollback is excellent and cheap, but you must know
exactly what it does *not* undo: sequences, advisory locks, external effects.
Tests now capture ids with `RETURNING id`. And it went into `AUTHORING.md`,
because the next author would hit it too.

---

## 11. `body.textContent` contained the 2.3 MB bundle

**Context.** A UI smoke test mounted the built app in jsdom and waited for the
loading text to disappear from `document.body.textContent`.

**What happened.** It waited forever. The final page text clearly showed the
loaded dashboard.

**Root cause.** The app bundle was injected as a `<script>` *inside `<body>`*,
and a script element's `textContent` is its source — which contains the string
`"Loading your progress"`. The predicate could never be true.

**Lesson.** Assertions on whole-document text are assertions on things you
didn't mean to include. Scope the query (`#root`), and when a wait loop times
out, dump the *exact* value the predicate saw — `polls=165, len=2322935` would
have said it all in one line.

---

## The pattern across all eleven

1. **Reproduce before theorising.** Bugs 1, 3, 11 each cost an hour of
   reasoning and ten minutes of measurement. The measurement should have come
   first.
2. **Question the layer below.** Bugs 3 and 11 were in the tooling, not the
   code I was staring at.
3. **Tests can be wrong in the spec, not the code.** Bugs 6, 7, 8, 10 were all
   in tests or lesson design. The reference solution was right; the assertion
   was asking for something impossible or ambiguous.
4. **A simplification is a promise.** Bugs 4 and 9 were "just the parts I
   need" implementations that silently dropped load-bearing semantics.
5. **Make the failure name itself.** Bugs 2 and 11 turned from mysteries into
   line numbers the moment the error carried the state it saw.

That fifth point is the one I would hand a junior first. Every diagnostic
improvement made in this project — the in-flight test name on timeout, the
poll count on a wait, the unhandled-rejection capture instead of a crash — was
cheap, and each paid for itself the very next time something broke.

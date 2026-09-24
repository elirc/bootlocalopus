# 003 — Review by disagreement: what a second reviewer actually catches

*2026-09-24 · Journal entry. Context: before the v2 pass, every area of the
codebase was reviewed twice — once by a reviewer and once by a second
reviewer whose brief was to attack the first. The reports are in
`reviews/`. This entry is about what the second pass changed, and why that
is the more important skill of the two.*

## Context

Six areas, six review pairs, roughly 400 findings between them. I was the
orchestrator: I wrote the briefs, read the results, and turned the
disagreements into `reviews/PLAN.md`. This is not a summary of the findings —
the reports are the findings. It is a record of how the two passes differed,
because the pattern is the same one a senior engineer sees in every code
review they run.

## What the first pass got right

Nearly every serious bug. A learner could forge a passing grade in three
different ways. Two parallel submits paid twice. The rate at which "correct
code timed out" scaled with machine load, because the sandbox's boot time was
charged to the learner. Draft autosave silently marked lessons "attempted"
and moved the Continue button. The economy let badge and quest XP outweigh
the curriculum itself, so a learner reached "Senior-Track" halfway through a
junior-to-mid course. All real. All reproduced.

If the first pass had been the only pass, the fix list would have been
correct and about three times too large.

## What the second pass changed

**Proportion.** The first pass proposed a 25-file server split for 450 lines,
a 30-file frontend split with a hooks layer for 1.7k lines, and a content
loader that would have multiplied startup time by four to twenty. The second
pass measured (`767 ms warm, 10–18 s cold` for the per-lesson loader), counted
(`1,701 lines`, not "2.5k"), and cut each plan to the shape the code actually
needed: four files, four files, and chapter-level metadata. None of that is
disagreement about facts. It is the difference between "this could be better
organised" and "this specific reorganisation is worth its cost."

**Evidence.** One report's section on mutation testing, cited as the basis
for a plan step, contained the literal string `MUTATION_RESULTS` — a template
placeholder that was never filled. The second pass ran its own 21-mutant
sample and found that five of the "kills" were timeouts on a loaded machine,
which the proposed design would have counted as successes. A roadmap appendix
listed 24 defects; the second pass verified 21 and found one that did not
exist — a "milder race" in `/hint` where there is no `await` between the read
and the write. I had read that appendix and believed it.

**Mechanism.** Several confirmed facts had the wrong cause attached. Leftover
sandbox directories were blamed on a cleanup/sweep race; the real cause was
`sweepRunsDir` deleting *another process's* live directory, which under
`tsx watch` happens on every file save. "Locked-lesson records drive
`nextUp`" was false — `nextUp` already required `lessonUnlocked`. A fix for
the wrong mechanism is a fix that does not work, and the first pass's plan
would have shipped one.

**Pedagogy.** The first pass proposed hidden tests on Submit to stop
learners running the free grader until it passed. The second pass rejected it
on cost (62 lessons to re-author) and on principle (a learner who cannot see
why they failed learns nothing), and replaced the whole first-try/combo
economy with a single "clean bonus." That is a design decision, not a bug
verdict, and it was reached by arguing about what the incentive would teach.

## The three questions the second reviewer kept asking

Looking across the six adversarial reports, the same three moves recur:

1. **"Show me."** Every load-bearing claim was reproduced or marked
   UNVERIFIABLE. The forgeries were run. The double payout was timed at a
   150 ms stagger. The typecheck program's file count was measured. Where
   the machine was too loaded to measure, the report *said so* instead of
   quoting the first pass's numbers.
2. **"Compared to what?"** A refactor plan is only good relative to the cost
   of not doing it. The second pass repeatedly asked what the smallest change
   was that fixed the confirmed bug — a dependency array, an uncancelled
   timer, a missing `ignore` flag — and found that four of the frontend's
   "structural" problems were under forty lines.
3. **"What did you miss?"** Each report was required to add findings, and
   each did — five to fourteen. The best ones were cross-area: the sandbox
   reviewer found that learner code could import the curriculum's `.ts`
   sources through the inherited `tsx` loader and read every reference
   solution. Nobody reviewing "content" or "the server" would have looked.

## The senior-level lesson

The valuable reviewer is not the one who finds the most. It is the one who
can be handed a confident, detailed, mostly-correct analysis and *still*
verify it — line by line, with a probe, on the actual code — before agreeing.
That is uncomfortable, because the first pass is usually right and checking
feels like distrust. It is also the only defence against the specific failure
mode this project demonstrated: a report that is 90% correct, whose 10% would
have cost days.

Two habits, concretely:

- When a document cites a number, find where it was measured. If you cannot,
  treat it as a claim, not a fact — and say which.
- When a plan proposes structure, ask for the bug it fixes. If the answer is
  "cleanliness," ask what it costs. Cleanliness that costs a 4× startup
  regression is not cleanliness.

## What I would do differently

Brief the *first* reviewer to cite evidence for every number and to mark
unmeasured claims explicitly. Half of the second pass's work was
re-establishing facts the first pass could have established once. The
adversarial pass should be spent on judgement — proportion, mechanism,
pedagogy — not on arithmetic.

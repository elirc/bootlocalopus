# 004 — Redesigning an economy that rewarded the wrong thing

*2026-09-24 · Journal entry. Context: the v1 game layer was reviewed
(`reviews/02-server-game-*.md`), and both reviewers agreed it was broken in
the same direction. This is the record of what was wrong, the options, the
numbers, and the decision.*

## Context

v1 paid XP like this: base per lesson; +25% for passing on the first submit;
a combo multiplier that grew with consecutive first-try passes; −12% per hint
(floored at −50%); a 20% cap after revealing the solution. Rank titles were
derived from XP level. Achievements paid 5,085 XP and daily quests roughly
3,200 over a month — against a curriculum worth 6,785.

Nothing in that list is unusual. Every one of those mechanics appears in
apps people like. The combination, measured, was wrong.

## What the numbers said

The first reviewer did the arithmetic and the second re-derived it with the
real `levelFromXp`:

- Bonus XP (badges + quests) exceeded lesson XP. A learner finishing every
  lesson would reach level 20–23 — the "Senior-Track" rank — on a course
  whose entire premise is junior-to-mid. "Mid II" arrived around the halfway
  point.
- The first-try bonus was collectable for free: `Run` graded without
  consequence, so the rational strategy was Run until green, then Submit once
  for the bonus and the combo. "First try" measured willingness to click Run,
  not understanding. The reviewer measured the premium at +49.6% over honest
  play.
- Hint pricing was flat per hint, floored at 50%. On a lesson with six hints,
  hints five and six were free. On a lesson with two, the second hint cost
  the same as the first on a lesson with six — the price bore no relation to
  how much of the lesson it gave away.
- Rank followed XP, so every one of those distortions fed directly into the
  headline claim the app makes about the learner.

## The options considered

**Hidden tests on Submit** (first reviewer). Keep a visible grader for Run
and add hidden cases that only Submit runs, so "first try" means something
again. Rejected by the second reviewer, and I agreed: sixty-two lessons
would need a second test suite each, and — worse — a learner who fails
hidden tests cannot see why. That is a trap dressed as rigour. The app's
entire pedagogy is "the tests tell you exactly what is wrong."

**Charge for Run** (also floated). Rejected on principle: a free, honest
grader is the reason to use this over a book.

**A "clean" bonus** (second reviewer). Pay +20% for a pass with no hints and
no reveal, whatever the attempt count. It rewards the thing that actually
correlates with understanding — solving it without being told — and it is
not gameable through Run, because Run does not open hints.

**Delete the combo.** It measured a streak of the gameable thing.

**Hint pricing proportional to the lesson.** Each hint costs
`base × 0.5 / hintCount`, so all hints together always cost exactly half and
none is ever free. The button shows the price.

**Rank from completion, not XP.** Junior I → Junior II at 10% of lessons →
Junior III at 25% → Mid-Track at 40% with a boss beaten → Mid I at 55% with
bosses in three tracks → Mid II at 70% with every track at half → Mid III at
85% with every boss → Mid-Level at 100%. "Senior-Track" deleted; the app does
not teach that and should not claim it. Bonus XP can no longer promote
anyone.

**Rescale bonus XP.** Achievements from 5,085 to 1,420; quests to 15–50 each,
and only drawn when the learner can actually reach them (a "solve two SQL
lessons" quest is not offered when one is unlocked). Levels remain, as a
progress bar with `100 + 50(n−1)` per level — the curve now lands 100%
completion at L18–L21 depending on how cleanly it was done.

## The decision

All of the second reviewer's proposals, with the exact numbers above. They
are encoded in `server/gamify.ts` and pinned by `server/gamify.test.ts` (31
cases), so a future change to any of them is a deliberate economy decision
that fails a test, not a drift.

One thing I added that neither reviewer asked for: the pass **snapshot**.
When a lesson passes, the record freezes `{ attempts, hintsUsed,
solutionRevealed, at }`. A learner who opens a hint *after* passing — to read
the explanation, which is a good thing to do — no longer loses the "clean"
status that the Flawless and No Safety Net badges depend on. Before this,
curiosity was penalised.

## The senior-level lesson

Every mechanic was defensible in isolation. The failure was in the *system*,
and it was only visible once someone did the arithmetic end to end: total
achievable XP, per source, against the level thresholds, against the rank
labels, against what a rational player would do with a free Run button.

The habit this argues for: when a design has more than two interacting
rules, write the simulation before shipping — even a twenty-line one. The
second reviewer's `fecon.mts` probe took minutes and would have caught all of
this before v1 existed. I did not write it. That is the mistake this entry
records.

The second habit: name what a metric *measures*, not what you want it to
mean. "First try" was named for the intent and measured the opposite. "Clean"
is named for what it measures.

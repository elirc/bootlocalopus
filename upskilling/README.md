# upskilling/

The app in this repository teaches a junior engineer to mid-level. This folder
is for the next step — **mid to senior** — and it uses the repository itself as
the vehicle: you grow by extending, operating, reviewing and occasionally
tearing down this codebase, not by reading about someone else's.

Nothing here is executed by the app. It is a journal, a set of real reviews,
and a programme.

```
upskilling/
  README.md            this file
  ROADMAP.md           the programme: competency model, missions, how to run it
  journal/             dated entries — decisions, mistakes, what they taught
  reviews/             adversarial code reviews of this project, kept verbatim
```

## How the pieces fit

**`ROADMAP.md`** is the spine. It defines what separates junior, mid and
senior on this stack as *observable behaviours*, then sequences ~20 missions
against this codebase — each with acceptance criteria and a note on what a
senior would do that a mid would not. Start there. Read it once end to end,
then work one mission at a time.

**`journal/`** is where the learning actually lands. Entries follow one
template — *context → decision → alternatives → evidence → what I'd do
differently* — because the value of a journal is in the honest parts, and
the template forces them. The first entries were written by the engineer who
built v1 and record eleven real bugs and the reflexes they should have
triggered. Add your own as you work through missions. Number them; date them;
never edit an old one — append a follow-up instead.

**`reviews/`** is unusual and worth explaining. Before the v2 improvement pass,
the codebase was reviewed by one model (Opus) per area — sandbox, server and
game economy, frontend, curriculum, tooling — and then each of those reviews
was *attacked* by a second model (Fable) whose brief was to verify every claim
against the code, find what the first reviewer got wrong or missed, and produce
the list of changes that should actually be made. Both documents are kept,
unedited, side by side:

| area | first review | adversarial review |
| --- | --- | --- |
| grading sandbox | `01-sandbox-opus.md` | `01-sandbox-fable.md` |
| server & game economy | `02-server-game-opus.md` | `02-server-game-fable.md` |
| frontend | `03-frontend-opus.md` | `03-frontend-fable.md` |
| curriculum | `04-curriculum-opus.md` | `04-curriculum-fable.md` |
| tooling & CI | `05-tooling-opus.md` | `05-tooling-fable.md` |
| this roadmap | `ROADMAP-draft.md` | `06-roadmap-fable.md` |

Read them in pairs. The gap between the two is the lesson: where the first
reviewer was confidently wrong, where a real bug was buried under an
overstated one, where a 30-file refactor plan collapsed into forty lines of
fixes once someone checked the dependency arrays. Learning to *be* the second
reviewer — to verify before you agree — is most of what "senior" means in
code review.

The roadmap deliberately asks you to review each area yourself **before**
reading the corresponding pair, then compare. Your list against theirs is a
calibration exercise you cannot get any other way.

## Ground rules

- Every mission ends with a journal entry, even when the mission failed —
  *especially* when it failed.
- Measure before and after. A mission that claims "faster" or "safer" without
  a number is not done.
- Nothing merges without tests you wrote to fail first. `npm test` must stay
  green; `npm run verify` proves every lesson still grades correctly.
- When a mission turns out to be wrong-headed halfway through, stopping and
  writing down why is a *completed* mission. Seniors kill their own bad ideas.

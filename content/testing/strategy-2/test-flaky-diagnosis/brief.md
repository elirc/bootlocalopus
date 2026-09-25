A flaky test is not random. It fails when something it depends on, and does
not control, happens to line up: another test ran first, the runner was
slower, the clock crossed midnight, the database returned rows in a
different order, two workers picked the same port. "Re-run until green"
hides the cause, and a suite where re-running is normal stops being read at
all. The real bug it was masking ships.

Diagnosing a flake is ordinary debugging with one extra step: **find the
condition that makes it fail on demand**. Run it alone and in the full suite,
shuffle the order, run it a hundred times in a loop, set `TZ` to somewhere
far away, pin the random seed, slow the machine down. Once it fails every
time, it is just a bug.

Each question below is a flake reported by a real team, with the evidence
they had. Pick the diagnosis or fix you would defend in the incident review.
Some questions have more than one correct answer.

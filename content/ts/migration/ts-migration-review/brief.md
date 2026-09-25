A migration produces hundreds of small pull requests titled "fix TS errors".
Reviewing them is where the migration either pays off or quietly fails: each
error can be **fixed** (the type now tells the truth, and a bug is gone) or
**silenced** (`!`, `as`, `any`, a suppression comment), and a silenced error
looks exactly like a fixed one in the diff stats.

Each question shows a change from such a PR. Pick the review comment you would
leave. Every question must be right to pass.

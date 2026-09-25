Nobody converts a 300,000-line JavaScript codebase to strict TypeScript in one
pull request. The teams that manage it do it **incrementally**: JavaScript and
TypeScript side by side, strict flags turned on one at a time and one area at a
time, a CI check that stops new code from going backwards, and a number that
shows progress. The teams that fail usually turn everything on at once, drown
in errors, and "temporarily" suppress them all.

These questions are the judgement calls a mid-level engineer is expected to
make, or to push back on, during such a migration. Every question must be
right to pass.

Functional style earns its place in JavaScript through a few specific
habits: pure functions you can test without setup, updates that never
mutate shared data, and small functions you compose instead of one big
one. It stops earning it when it becomes a style rule applied everywhere:
spread in a hot loop, a point-free chain nobody on the team can read, a deep
clone "to be safe" that defeats every memo.

These questions are judgement calls taken from code review. For each one,
work out what the code actually does, then whether the functional version
helps.

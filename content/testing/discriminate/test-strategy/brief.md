A team can have 2,000 tests, 95 % coverage and a green pipeline and still
ship a pricing bug every sprint. The unit tests mock the database, so the
query that is wrong is never run. The end-to-end suite is so flaky that people
re-run it until it passes. The snapshots get updated with `-u` whenever they
fail. Coverage counts lines that ran. It does not count lines that were
checked.

Test strategy decides what each kind of test is *for*, where it runs, and
what you do when a test stops giving a trustworthy signal.

The questions below are real calls you will make in review and in planning.
Several options sound reasonable: pick the one you would defend to a senior
engineer whose question is *"what would this catch?"*. Some questions have
more than one correct answer.

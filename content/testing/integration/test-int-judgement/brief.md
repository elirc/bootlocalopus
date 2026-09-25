Integration tests are where teams lose the most time. They pass locally
and fail in CI because two files both used port 3000. They pass alone and
fail together because one test left an order in a shared database. They
mock so much that they are unit tests with extra steps. Or they mock so
little that every run charges a real sandbox card and takes four minutes.

The skill is choosing **what is real and what is fake**, and keeping each
test **independent**, **deterministic** and **cleaned up**. These questions
are the calls you make when you write or review an integration test.

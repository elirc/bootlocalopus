Most async bugs are not exotic. They are a handful of patterns that look fine
in review and fail under load, on a slow network, or when a user clicks
twice: a timeout that stops waiting but not working, a `forEach` that does not
wait, a cleanup handler that creates the very rejection it was meant to avoid.

These questions are judgement calls from code review. Read each snippet as if
it were in a pull request you are about to approve.

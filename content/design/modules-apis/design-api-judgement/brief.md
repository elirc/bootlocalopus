Most module-API mistakes are not bugs on the day they are written. They are
decisions — a boolean parameter, an exported helper, "just return the row" —
that become expensive the first time someone else depends on them. Once
another team calls your function, its signature, its errors and even its
accidental behaviour are a contract.

These questions are the review-time calls from this chapter: what counts as a
breaking change, what belongs on a module's surface, and how a module should
fail. Some have more than one right answer.

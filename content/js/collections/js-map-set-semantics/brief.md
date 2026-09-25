A plain object and a `Map` look interchangeable until the data stops being
tidy. Object keys are always strings (or symbols), so `1` and `"1"` are one
key. Integer-like keys are enumerated in numeric order before every other key,
so an object "sorted by insertion" is not. `JSON.stringify` silently turns a
`Map` into `{}`. And a `Set` of objects deduplicates nothing, because objects
are compared by identity.

None of this is trivia: each of these questions is a bug that has shipped in a
real codebase. Answer them as you would in a code review, before you write the
rest of this chapter's collections.

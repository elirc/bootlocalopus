Every JavaScript number is an IEEE 754 double: 53 bits of precision, in base
two. Most decimal fractions — `0.1`, `19.99`, `1.005` — have no exact binary
form, so they are stored as the nearest value that does exist, and every
operation rounds again. Past 2⁵³ not every integer exists either. And the
conversions from text are a zoo in which `''`, `null` and `'  '` are all zero.

None of this is exotic. These are the number bugs that reach production in
checkout pages, invoice PDFs and form validators. Answer as you would in a code
review; the rest of this chapter builds the fixes.

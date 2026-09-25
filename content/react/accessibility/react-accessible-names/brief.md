Every interactive element has an **accessible name**: the words a screen
reader says for it, the words voice control users speak to click it, and the
string `getByRole('button', { name })` matches in your tests. When it is
missing, a screen reader says "button" and nothing else. When it is wrong,
"Delete" deletes something other than what it said.

These questions cover where names come from, which ARIA to reach for (and
which not to), and the native elements that make most of it unnecessary.

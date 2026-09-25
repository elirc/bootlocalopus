Nobody reads a changelog that is `git log --oneline` pasted into a file:
forty lines of `chore: bump deps`, `fix typo`, `wip`, and somewhere in the
middle the one line that says the API now returns cents instead of pounds.
The people who read release notes (the support team, the mobile developers,
the customer who upgrades your library) want three things: **what will break
me**, what is new, and what was fixed. In that order, and nothing else.

## Your task

Implement `renderChangelog(version, date, commits)`. The commits are already
parsed, oldest first:

```js
{
  sha: '3f2b8c1e9d4a4b7e8f215c6d7e8f9a0b1c2d3e4f', // 40 hex characters
  type: 'feat',             // feat, fix, perf, revert, chore, docs, …
  scope: 'api',             // or null
  description: 'return totals in cents',
  breaking: true,
  breakingNote: 'Totals are integers in cents, not decimal pounds.', // or null
  pr: 412,                  // or null
  reverts: null,            // for type 'revert': the full sha it reverts
}
```

Return a Markdown string built like this:

```md
## 1.5.0 (2024-05-01)

### Breaking changes

- **api:** Totals are integers in cents, not decimal pounds. (#412)

### Features

- **api:** return totals in cents (#412)
- **export:** CSV export for orders (#398)
- dark mode (#401)

### Bug fixes

- **cart:** keep discount after removing an item (3f2b8c1)
```

**Sections**, in this order, each only if it has entries:

1. `### Breaking changes`: every commit with `breaking: true`, **of any
   type**, using its `breakingNote`, or its `description` when the note is
   `null`.
2. `### Features`: type `feat`.
3. `### Bug fixes`: type `fix`.
4. `### Performance`: type `perf`.
5. `### Reverts`: type `revert` whose reverted commit is **not** in this list
   (it shipped in an earlier release), using its `description`.

A breaking `feat`, `fix` or `perf` appears **twice**: in Breaking changes
(with the note) and in its own section (with the description). Any other type
(`chore`, `docs`, `refactor`, `test`, `ci`, …) appears only in Breaking
changes, if it is breaking, and otherwise not at all.

**Reverts in the same release cancel out.** A `revert` whose `reverts` is
the `sha` of a commit **in this list** removes that commit, and itself,
entirely: neither appears anywhere, not even in Breaking changes.

**Entries** are `- **scope:** text (ref)`, or `- text (ref)` without a scope,
where `ref` is `#` + `pr`, or the **first 7 characters of the sha** when
`pr` is `null`. Within a section, entries **with a scope come first, sorted
by scope** (plain string comparison), then entries without a scope. Entries
with the same scope keep their commit order.

**Layout.** The heading `## <version> (<date>)`, a blank line, then the
sections separated by one blank line (heading, blank line, entries), and a
single `\n` at the very end. When no section has entries, the body is the
line `No user-facing changes.` instead.

## The traps

- Sort **stably**. `Array.prototype.sort` is stable, so sorting by scope
  alone keeps commit order within a scope. A comparator that also sorts by
  description reorders them.
- A revert cancels the reverted commit even when it was breaking: the thing
  that would have broken people never shipped.

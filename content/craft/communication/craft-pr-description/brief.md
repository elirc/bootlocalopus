A PR description is the only design document most changes ever get. The
reviewer reads it before the diff, the on-call engineer reads it at 3 am from
`git blame`, and the person who reverts it next year reads nothing else. The
team added a template:

```md
## What
<!-- What does this change do? -->

## Why
<!-- Link the ticket, e.g. SHOP-123, and say why it matters. -->

## How to test
<!-- Steps a reviewer can follow. -->

## Checklist
- [ ] I added or updated tests
- [ ] I checked this on a phone
```

Three weeks later, half the PRs are the template, untouched. The comments
are invisible in the rendered view, so the description *looks* like it has
sections. A bot that points this out politely, on every PR, fixes it faster
than any retro.

## Your task

Implement `reviewPrDescription(body, { changedFiles = [], labels = [] } = {})`.
It returns a list of problems `{ rule, detail }` (`detail` is a string, or
`null` where the table says so), **in the order below**.

**First, strip HTML comments** (`<!-- … -->`, which can span lines). Every
rule looks at the body **without** them: template hints are not content.

**Sections.** A section starts at a line beginning with `## ` or `### `; its
name is the rest of the line, trimmed, compared **case-insensitively**. Its
content is every line up to the next line that starts with `#`. Content is
**empty** when, trimmed, it is nothing, or only `TODO`, `TBD` or `N/A` (any
case).

| Order | `rule` | `detail` | When |
| --- | --- | --- | --- |
| 1 | `missing-section` or `empty-section` | the section name as written here: `What`, `Why`, `How to test` | Checked for each of the three, in that order. |
| 2 | `no-ticket` | `null` | No ticket key (`/\b[A-Z][A-Z0-9]+-\d+\b/`, like `SHOP-123`) anywhere in the body, and the PR has no `no-ticket` label. |
| 3 | `no-screenshot` | `null` | A changed file ends in `.tsx`, `.jsx`, `.css` or `.scss`, and the body has no image: neither `![alt](url)` nor `<img`. |
| 4 | `no-rollback` | `null` | A changed file has a `migrations` directory in its path (`db/migrations/0042.sql`), and there is no non-empty `Rollback` section. |
| 5 | `unchecked-box` | the item's text, trimmed | For each line that starts with `- [ ] ` (after leading spaces), in body order. `- [x]` is checked. |

An empty array means the description is good to go.

## The traps

- **Strip comments before anything else.** The template's own hint contains
  `SHOP-123`; a check that runs on the raw body finds a ticket in every PR.
- A section that holds only a comment, or `TODO`, is **empty**, not missing.
  The difference matters to the author: "fill this in" versus "you deleted
  a heading".
- The `migrations` rule is about a **directory**:
  `src/migrationsHelper.ts` is not a migration.

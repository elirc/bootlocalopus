Version `2.3.0` of the team's shared API client removed a method. The
commit said `feat: simplify client`, so the release script bumped the minor
version, every service that depends on `^2.2.0` picked it up on their next
install, and four builds broke on a Friday. The version number is a promise
to everyone downstream: **major** means "this may break you", **minor**
means "new things, nothing removed", **patch** means "fixes only".

Most teams let the commit messages decide the bump, using the
[Conventional Commits](https://www.conventionalcommits.org) format, so the
promise is made by the person who knows what changed, at the time they
change it, and the release is automatic.

## Your task

Implement `nextVersion(current, commits)`. `current` is the last released
version, `commits` is an array of full commit messages (header line,
optional blank line and body, optional footers) since that release. Return
the next version string, or `null` when nothing in the list warrants a
release.

**The version.** `current` must be `MAJOR.MINOR.PATCH`: three non-negative
integers with no leading zeros (`0` is fine, `01` is not) and nothing else
(no `v`, no `-beta.1`). Otherwise throw a `TypeError`.

**Reading a commit.** Only the **first line** is the header. A header is
conventional when it matches `type(optional scope)optional-!: description`,
for example `feat: add export`, `fix(api): handle 404`,
`refactor(db)!: drop legacy columns`. The type is letters only and is
compared **case-insensitively** (`Fix:` is a fix). A space after the colon
is required. Headers that do not match (`Merge branch 'main'`, `wip`,
`feature: x`) are ignored.

**What each commit asks for:**

- **major**, if it is breaking: a `!` right before the colon, **or** a line
  in the body that starts with `BREAKING CHANGE: ` or `BREAKING-CHANGE: `
  (upper case, exactly). "breaking change" anywhere else, including the
  header, does not count. A breaking commit of **any** type is major, even
  `chore!:`. The body only counts when the header is conventional.
- **minor**, for type `feat`.
- **patch**, for type `fix` or `perf`.
- nothing, for any other type (`chore`, `docs`, `refactor`, `test`, `ci`…).

**The bump.** Take the largest request across all the commits and apply it
**once**: three `feat` commits are one minor bump, not three. A bump resets
everything to its right: `1.4.2` + minor is `1.5.0`, + major is `2.0.0`.

**Before 1.0.** While the major version is `0`, the API is not yet stable,
and a breaking change bumps the **minor** version instead
(`0.4.2` → `0.5.0`). Features also bump minor and fixes patch.

## The traps

- `1.4.2` + a feature is `1.5.0`, not `1.5.2`.
- `docs: explain our BREAKING CHANGE policy` is a docs commit. Look for the
  footer at the **start of a body line**, never in the header.
- `feature:` is not `feat:`, and `feat:add` (no space) is not conventional.

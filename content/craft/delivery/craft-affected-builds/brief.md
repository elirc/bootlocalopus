The monorepo's CI runs every package's tests on every PR: 38 minutes to
merge a typo fix in the admin app. Someone adds a filter, "only test the
packages whose files changed", and CI drops to 4 minutes. Two weeks later a
change to `packages/money` ships a rounding bug straight into checkout: only
`money`'s own tests ran, and they passed. The **checkout** tests, the ones
that would have caught it, were skipped, because checkout's files had not
changed. Checkout depends on `money`.

"Affected" means **changed, or depending on something changed**, all the way
up the graph. Tools like Nx, Turborepo and `pnpm --filter ...[origin/main]`
all compute exactly this. It is worth knowing what they do, because the day
the CI config is wrong, you are the one who has to work out why a broken
package went green.

## Your task

Implement `affectedPackages(changedFiles, packages, { globalFiles = [] } = {})`.

```js
const packages = [
  { name: '@shop/money',    dir: 'packages/money',    deps: [] },
  { name: '@shop/checkout', dir: 'packages/checkout', deps: ['@shop/money', 'react'] },
  { name: '@shop/web',      dir: 'apps/web',          deps: ['@shop/checkout'] },
];
affectedPackages(['packages/money/src/round.ts'], packages);
// → ['@shop/checkout', '@shop/money', '@shop/web']
```

- **Which package owns a file.** A file belongs to a package when it is
  inside the package's `dir`, compared by **whole path segments**:
  `packages/api-client/x.ts` is not inside `packages/api`. When package dirs
  are nested (`apps/web` and `apps/web/plugins/pay`), the **deepest** one
  owns the file.
- **Markdown never counts.** Files ending in `.md` affect nothing, wherever
  they are.
- **Global files.** Each entry of `globalFiles` is an exact path
  (`'package-lock.json'`) or, when it ends in `/`, a directory prefix
  (`'.github/workflows/'`). A changed file matching one affects **every**
  package.
- Any other file outside every package (`docs/adr/0007.txt`, `scripts/x.sh`)
  affects nothing.
- **Dependents.** A package is affected if it owns a changed file, or if any
  of its `deps` is affected, **transitively**. Names in `deps` that are not
  in `packages` (`'react'`) are external and ignored. The graph can contain
  a cycle; that must not hang.
- Return the affected package **names, sorted**, with no duplicates.

## The traps

- **Direction.** When `money` changes, you rebuild what depends **on**
  money (checkout, web), not what money depends on. Build a reverse map
  (`dependents`) first; walking `deps` from the changed package goes the
  wrong way.
- `file.startsWith(dir)` puts `packages/api-client/x.ts` in `packages/api`.
  Compare `file.startsWith(dir + '/')`.
- Keep a `visited` set in the walk. Package graphs are not supposed to have
  cycles; real ones sometimes do.

Every "copy the build to the deploy folder" script eventually needs a
`--dry-run`, and the first version of it is usually a lie: the code checks a
flag *inside* each `copyFile` call, and a new branch someone added later does
not. The design that cannot lie separates **deciding** from **doing**: one
function computes a plan and touches nothing, a second function executes a
plan. `--dry-run` prints the plan; a real run applies the same plan.

Two more classics this lesson catches:

- **Comparing by size or mtime alone.** A config file that changes `port: 8080` to
  `port: 9090` keeps its size; `cp` without `-p` and `git checkout` both reset
  mtimes. When sizes are equal, compare the **content**.
- **Reporting paths with the platform separator.** On Windows,
  `path.relative` returns `assets\app.js`. A plan printed for humans, logged,
  or compared in a test should use `/` everywhere.

## Task

Export `async function planSync(srcDir, destDir, { deleteExtra = false } = {})`.
It resolves an array of `{ action, path }` and **modifies nothing**:

- `path` is the file's path relative to the directory, joined with `/` on
  every platform (`assets/app.js`).
- `'copy'` — a file exists in `src` but not in `dest`;
- `'update'` — it exists in both and the **contents differ** (same size is
  not enough to call them equal);
- `'delete'` — it exists in `dest` but not in `src`, **only** when
  `deleteExtra` is `true`;
- identical files produce no entry.
- Recurse into subdirectories; only regular files count (skip symbolic links;
  empty directories produce nothing).
- A `destDir` that does not exist yet counts as empty. A missing `srcDir`
  rejects with the file system's `ENOENT` error.
- Sort the result by `path` (plain string comparison, `a < b`).

Export `async function applySync(srcDir, destDir, plan)` that performs the
plan: `copy`/`update` copy the file from `src` to `dest`, creating parent
directories as needed; `delete` removes the file from `dest`. After
`applySync`, a fresh `planSync` with the same options returns `[]`.

Linters, bundlers, test runners and every "process all the files in this
folder" script walk a directory tree. The quick version —
`readdir(root, { recursive: true })` plus a `stat` per entry — has three
problems at work:

- it **follows directory links**, so one symlink (or Windows junction) pointing
  back up the tree makes it loop until the path is too long, and `stat` then
  reports the linked folder's files as if they lived there;
- it cannot **prune**: it descends into `node_modules` and `.git`, reading
  hundreds of thousands of entries you then throw away;
- it builds the whole list in memory before you see the first file.

A hand-written walk fixes all three: `readdir(dir, { withFileTypes: true })`
gives you a `Dirent` per entry, so you know what each entry is without an
extra `stat`, and you decide whether to go in.

## Task

Export an **async generator** `walk(root, options = {})` that yields the path of
every **file** under `root`:

- Paths are **relative to `root`** and always use **`/`** as the separator,
  on every OS (`src/lib/util.js`, never `src\lib\util.js`). `path.join` uses
  `\` on Windows; build the relative path yourself or convert it.
- Recurse into subdirectories. Directories themselves are never yielded.
- `options.ignore` — an array of names (default `[]`). Any entry, file or
  directory, whose **name** is in the list is skipped, at any depth; an ignored
  directory is **not entered at all**.
- `options.extensions` — an optional array such as `['.js', '.ts']`. When
  given, only files whose extension (`path.extname`) matches one of them,
  **case-insensitively**, are yielded. A *directory* named `lib.js` is still
  walked into, never yielded.
- **Symbolic links and junctions are neither yielded nor followed**
  (`dirent.isSymbolicLink()`).
- If `root` does not exist, iteration rejects with the `ENOENT` error.

The order of the yielded paths is up to you; the tests sort them.

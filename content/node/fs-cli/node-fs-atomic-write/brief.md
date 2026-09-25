`writeFile(path, data)` opens the target with `O_TRUNC`: the old contents
are gone **before** the first new byte lands. If the process crashes, the disk
fills up, or the data source throws halfway, you are left with an empty or
half-written file — and for a config, a state file or a cache index, that
means the next start fails too. Anyone reading the file while you write it
also sees the half.

The fix every serious tool uses: write to a **temporary file in the same
directory**, then `rename` it over the target. A rename within one filesystem
replaces the target in one step, so readers see either the old file or the new
one, never a mix. (A temp file under `os.tmpdir()` may be on a different
drive, where `rename` fails with `EXDEV` — so keep it next to the target.)

## Task

Export `async function writeFileAtomic(filePath, data)`, where `data` is a
string, a `Buffer`, or an async iterable of strings/Buffers (a stream or an
async generator — `fs/promises` `writeFile` accepts all three).

- Write `data` to a temp file **in the same directory** as `filePath`, then
  `rename` it onto `filePath`. Resolve `undefined` when done.
- While the write is in progress, `filePath` must still hold its **old**
  contents (or not exist yet).
- **Unique temp names.** Two overlapping calls for the same `filePath` must
  not share a temp file: a fixed name such as `filePath + '.tmp'` lets the
  second call truncate the first one's half-written data. Add something random
  (`crypto.randomBytes`, `randomUUID`) or the pid plus a counter.
- **On any failure** (the data source throws, the directory does not exist, the
  rename fails): remove the temp file if it was created, leave `filePath`
  untouched, and reject with the **original** error.
- After success, the directory contains the target and nothing else of yours.

Not graded but worth doing: call `handle.sync()` (fsync) before closing the
temp file, so a power cut after the rename cannot leave a renamed-but-empty
file.

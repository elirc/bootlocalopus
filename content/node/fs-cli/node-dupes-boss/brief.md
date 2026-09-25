**Boss: `find-dupes`.** The shared drive is full and someone has to find out
why. You are writing the tool that answers — a complete CLI that walks
directories, finds files with identical content, and reports them in a form a
human can read and a script can parse. Everything in this chapter meets here:
argument validation, directory walking, stdout/stderr discipline and exit
codes.

The traps a first version falls into:

- **Hashing everything.** Two files can only be identical if they have the
  same size. Group by size first and hash only sizes that occur more than
  once; on a real drive that skips most of the reading.
- **Reporting a file as its own duplicate.** `find-dupes photos photos/2023`
  walks `photos/2023` twice. The same file on disk (same resolved absolute
  path) must be counted **once** — keep the first path you saw for it.
- **Crashing on one bad argument.** A missing directory is reported, the
  others are still scanned, and the exit code says something went wrong.

## Task

Export `async function main(argv, io)`. `io` has `stdout` and `stderr`, each
with `write(string)`. `main` never throws and never calls `process.exit`: it
resolves the exit code.

```
usage: find-dupes [--json] [--min-size <bytes>] <dir>...
```

**Arguments.** `--json` switches the output format. `--min-size <n>` (or
`--min-size=<n>`) sets the smallest file size considered, default `1` (so empty
files are ignored); `n` must be a non-negative whole number written in digits.
Usage errors resolve **`2`** with **nothing on stdout** and stderr **ending
with** the usage line (`usage: … <dir>...\n`):

- no directory arguments → exactly the usage line;
- an unknown option, or `--min-size` with no value → any one-line message,
  then the usage line;
- a bad `--min-size` value (`-1`, `1.5`, `abc`, an empty string) →
  `find-dupes: --min-size must be a non-negative integer\n` then the usage line.

`--help` writes the usage line to stdout and resolves `0`.

**Walking.** Recurse into every directory argument. Consider regular files
only; skip symbolic links, and do not descend into directories named
`node_modules` or `.git`. A file's **display path** is the directory argument
exactly as given, then `/`, then its path below that directory joined with
`/` (`photos/2023/beach.jpg` for argument `photos`).

If a directory argument does not exist, write
`find-dupes: <arg>: no such directory\n` to stderr; if it exists but is not a
directory, `find-dupes: <arg>: not a directory\n`. Carry on with the other
arguments, and resolve **`1`** at the end. Otherwise resolve `0` — finding
duplicates is a successful run.

**Duplicates.** A group is two or more distinct files (by resolved absolute
path) with size `>= min-size` and byte-identical content. Sort the display
paths inside a group, and the groups by **size descending**, then by their
first path; all comparisons are plain string `<`. `wastedBytes` is the sum
over groups of `size × (copies − 1)`.

**Text output** (default) — per group, a header line and one indented line
per path, groups separated by a blank line, then a summary:

```
2048 bytes, 3 copies:
  backup/a.jpg
  photos/a.jpg
  photos/b/a-copy.jpg

5 bytes, 2 copies:
  photos/x.txt
  photos/y.txt

2 duplicate groups, 4101 bytes wasted
```

The summary is always `<n> duplicate groups, <w> bytes wasted` — plural even
for `1`, so scripts can match it. With no groups, stdout is exactly
`no duplicates\n`.

**JSON output** (`--json`) — stdout is exactly one line,
`JSON.stringify({ groups: [{ size, paths }, …], wastedBytes }) + '\n'`,
with the same order. Errors still go to stderr in JSON mode.

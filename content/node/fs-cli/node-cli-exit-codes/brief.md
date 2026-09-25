A CLI's contract is not just what it prints. Scripts, CI jobs and `&&` chains
read three things: **stdout** (the data), **stderr** (the diagnostics), and the
**exit code** (did it work). The common mistakes each break a pipeline:

- printing errors with `console.log` puts them on stdout, so
  `count-lines *.log | sort -n` sorts your error messages in with the numbers;
- stopping at the first bad file hides the results for all the good ones;
- exiting `0` after a failure makes CI green when it should be red;
- calling `process.exit()` right after writing can **cut off output** still
  queued for a pipe. Set `process.exitCode` and let the process end by itself.

Conventional codes: `0` success, `1` the command ran but something failed,
`2` the command was used wrongly (bad flags, missing arguments).

To keep it testable, the whole CLI lives in one function that receives its
streams and **returns** the exit code. The real entry point is a single line:
`main(process.argv.slice(2), process).then((code) => { process.exitCode = code; })`.

## Task

Export `async function main(argv, io)` for `count-lines`, which counts the
lines in files. `io` has `stdout` and `stderr` (each with `write(string)`) and
`stdin` (a Readable). `main` must **never throw** and never call
`process.exit`; it resolves the exit code.

```
usage: count-lines [--total] <file>...
```

- For each file argument, **in order**, write `<count>\t<file>\n` to stdout,
  where `<file>` is the argument exactly as given.
- A **line** is a run of text ended by `\n`, plus a final line with no `\n` if
  the file does not end with one. An empty file has `0` lines; `"a\nb"` and
  `"a\nb\n"` both have `2`.
- The argument `-` means **read `io.stdin`** instead of a file (labelled `-`).
- If a file cannot be read, write `count-lines: <file>: <reason>\n` to
  **stderr** and carry on with the next one. `<reason>` is `no such file` for
  `ENOENT`, `is a directory` for `EISDIR`, otherwise the error's message.
- With `--total` (anywhere in `argv`), finish with `<sum>\ttotal\n` on stdout,
  summing the files that were counted.
- Resolve `1` if any file failed, else `0`.

Usage errors resolve **`2`** and write to **stderr**, with nothing on stdout:

- no file arguments → `usage: count-lines [--total] <file>...\n`
- any other argument starting with `--` (e.g. `--totals`) →
  `count-lines: unknown option '--totals'\n` followed by the usage line.

`--help` writes the usage line to **stdout** and resolves `0` (help that was
asked for is output, not an error).

Read files as streams (`createReadStream`) and count `\n` bytes, so a 5 GB log
does not need 5 GB of memory; for the tests either approach passes.

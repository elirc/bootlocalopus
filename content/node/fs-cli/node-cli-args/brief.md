The usual hand-rolled argument parser reads `process.argv[2]` and
`process.argv[3]` by position, turns `--limit abc` into `NaN` and exports
`NaN` rows, and treats a mistyped `--dryrun` as the file name — so the "dry run"
writes for real. A CLI that other people (and cron jobs) run must **reject**
what it does not understand, loudly and before doing anything.

Node ships a real parser: `parseArgs` from `node:util`. It handles
`--limit 10`, `--limit=10`, `-n 10`, grouped short flags (`-vn 10`), repeated
options, and `--` (everything after it is positional, so a file can be called
`--weird`). It does **not** validate values: every string option is a string,
and checking it is your job.

## Task

Export `parseCliArgs(argv)` for this command (`argv` excludes `node` and the
script, like `process.argv.slice(2)`):

```
export-users [options] <output-file>

  -f, --format <csv|json>   default csv
  -n, --limit <n>           a positive integer; default: no limit (null)
      --since <YYYY-MM-DD>  a real calendar date; default null
      --tag <name>          repeatable; default []
  -v, --verbose             default false
      --dry-run             default false
  -h, --help                default false
```

Return **`{ ok: true, value }`** with

```js
{ output, format, limit, since, tags, verbose, dryRun, help }
```

where `output` is the one positional argument (`-` is a valid value: it means
stdout), `limit` is a **number** or `null`, and `since` is the original string
or `null`. `tags` must be a **new array on every call**: a `default: []` in
a shared options object is one array that every call hands out. With `--help`, the positional may be missing (`output: null`), and
nothing else is validated beyond what the parser itself rejects.

Otherwise return **`{ ok: false, error }`**, never throw. `error` is a
message for a human, and it must contain the **long name** of the option at
fault (`--limit`, even if the user typed `-n`), or the word `output` for a
positional problem. The cases:

| input | why it fails |
| --- | --- |
| an unknown option (`--dryrun`, `--no-verbose`) | its name must appear in `error` |
| `--limit` with no value, `--limit=` | missing value |
| `--limit` that is not a whole number ≥ 1: `abc`, `0`, `-3`, `1.5`, `10abc`, `1e3`, `0x10`, `" 5"` | invalid number |
| `--format` other than `csv` or `json` | invalid choice |
| `--since` not `YYYY-MM-DD`, or not a real date (`2024-02-30`) | invalid date |
| no positional, or more than one | exactly one `output` required |

The trap in `--limit`: `Number('1e3')` is `1000`, `Number(' 5')` is `5`,
`parseInt('10abc')` is `10`. Match the string against `/^[1-9]\d*$/` first.

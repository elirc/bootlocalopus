Every service and CLI reads a config file, and the usual version has two bugs.
It checks `existsSync(path)` and then reads, which races with anything that
deletes or replaces the file in between. And it wraps the read in
`try { … } catch { return defaults }`, so a typo in the JSON or a path that
points at a directory **silently runs production on the defaults**.

The rule: ask for the file and handle the one error you expect. A missing
file (`ENOENT`) is normal and means "use the defaults". Anything else is a
real problem the operator must see.

## Task

Export a class `ConfigError extends Error` (with `name === 'ConfigError'`)
and an async function `loadConfig(filePath, defaults)`:

| situation | result |
| --- | --- |
| the file does not exist (`ENOENT`) | resolve a **copy** of `defaults` |
| the file holds a JSON object | resolve `{ ...defaults, ...fileValues }` (shallow merge; the file wins) |
| the JSON is invalid, or the file is empty | reject with a `ConfigError` |
| the JSON is valid but not a plain object (an array, `null`, `42`, `"x"`) | reject with a `ConfigError` |
| any other fs error (`EISDIR`, `EACCES`, …) | reject with that **original** error, unchanged |

A `ConfigError` must:

- have `.path` set to `filePath`,
- include `filePath` somewhere in its `message`, so the log line says *which* file,
- for invalid JSON, set `.cause` to the original `SyntaxError`
  (`new ConfigError(message, { cause })`, then set `.path`).

Two more details the tests check:

- **A UTF-8 byte-order mark.** Windows editors often save a file starting with
  `﻿`, and `JSON.parse` rejects it. Strip one leading BOM before parsing.
- **Never mutate `defaults`.** Callers reuse the same defaults object; the
  result must be a new object even when the file is missing.

Read the file with `readFile` from `node:fs/promises` directly — do not check
for it first.

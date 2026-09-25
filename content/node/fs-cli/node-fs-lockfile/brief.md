A nightly export takes 70 minutes and cron starts it every hour. For ten
minutes a day two copies run at once, both writing the same output file. The
usual guard makes it worse:

```js
if (!existsSync(lockPath)) await writeFile(lockPath, String(process.pid)); // two runs both get here
```

Check-then-create is a race: both processes see "no lock" before either
creates it. The file system has an atomic primitive for exactly this —
**exclusive create**. `open(path, 'wx')` creates the file, or fails with
`EEXIST` if it already exists, as one operation. Exactly one caller wins.

The second problem is the **stale lock**: the job crashed (or the machine
rebooted) and the lock file is still there, so every later run refuses to
start until a human deletes it. A lock therefore records who took it and
when, and a lock older than a limit is taken over.

## Task

Export `class LockedError extends Error` with `name` `'LockedError'` and a
`holder` property, and `async function acquireLock(lockPath, options)` with
options `{ staleMs = 60000, now = Date.now, pid = process.pid }`.

`acquireLock` resolves `{ release }` or rejects:

1. Create `lockPath` **exclusively** and write JSON
   `{ "pid": <pid>, "createdAt": <now()>, "token": <random string> }` into it.
2. If it already exists (`EEXIST`), read it and work out its age:
   - if it parses as JSON with a numeric `createdAt`, the age is
     `now() - createdAt`, and `holder` is `{ pid, createdAt }` from the file;
   - otherwise (empty or garbage — a crash between create and write, or
     another process mid-write) use the file's **mtime** (`stat().mtimeMs`)
     instead, and `holder` is `null`.
3. If the age is **greater than** `staleMs`, delete the old file and try the
   exclusive create **once more** (if that loses to someone else, reject with
   `LockedError` as below). Otherwise reject with a `LockedError` whose
   `holder` is as above. The message is up to you.
4. Any other error (e.g. `ENOENT` because the directory does not exist)
   rejects **as is** — it is not a `LockedError`.

`release()` returns a promise and deletes the lock file **only if it is
still ours**: read it and compare the `token`. If a later run took it over
as stale, releasing must leave the new owner's lock alone. Calling
`release()` again, or after the file is gone, is a no-op.

Also export `async function withLock(lockPath, fn, options)`: acquire, run
`await fn()`, release in a `finally`, and return `fn`'s result.

The tests call `acquireLock` many times at once on the same free path;
exactly one may win. (Taking over a *stale* lock still has a small race: two
runs can both decide it is stale, and the slower one's delete removes the
faster one's fresh lock. Real tools such as `proper-lockfile` narrow that
window further; for a cron job with a generous `staleMs` it is acceptable.)

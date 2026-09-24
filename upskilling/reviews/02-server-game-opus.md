# Review 02: server and game layer

Scope: `server/index.ts`, `server/gamify.ts`, `server/progress.ts`, `server/content.ts`, `content/types.ts`, plus `scripts/e2e.ts` for current coverage. I also read `server/runner/index.ts` and the worker's load order, because they decide what the client can extract.

Method: I read all the code, then probed a throwaway server on :4599 and ran an economy simulation that uses the real `computeXp`/`levelFromXp` and the real curriculum. I backed up `data/progress.json` before probing and restored it afterwards.

## Executive summary

The game rules are pure and readable. The problems sit between the rules and the HTTP layer, and several of them are reproducible:

1. **Two concurrent submits of the same lesson both pay out.** In my probe, one 50-XP lesson paid 63 + 50 XP and also finished the "Complete 2 lessons" quest (+40). `alreadyPassed` is read before the `await` and trusted after it.
2. **One malformed request kills the process.** `{"code":{"toString":1}}` makes `String()` throw inside an async Express 4 handler. That is an unhandled rejection, and Node 24 exits. Bad JSON returns an HTML page with a stack trace.
3. **Locked lessons are not locked.** `/solution`, `/hint` and `/run` skip `lessonUnlocked`. I got the reference solution and the hints for the locked `js-task-queue`, and ran its graders, which returned the test names and failure messages. Separately, sandboxed code can `readFileSync` `content/*/index.ts` (every solution and grader) and `data/progress.json`. The comment in `runner/index.ts:82` says learner code can't read the save file; it can.
4. **The server listens on all interfaces** (`index.ts:439`) and runs arbitrary code with filesystem access. Anyone on the same network can execute code on the learner's machine. The README's "nothing leaves your machine" is only true if the machine has a firewall.
5. **The persistence layer can silently wipe the save.** Any read or parse error in `load()` falls back to `fresh()`, and the next `save()` overwrites the unreadable file. There is no fsync, no backup, the migration `version` is never read, and two server processes share one file without a lock. `e2e` changing only `PORT` does not isolate it.
6. **The economy rewards the wrong things.** "Run" is free and runs the full grader, so "Run until green, then Submit" always earns the first-try bonus and combo. That path earns **+46% lesson XP** over honest play. Achievements (5,085 XP) plus quests (~3,200) are worth **more than the whole curriculum** (6,785). A typical learner finishes the junior→mid curriculum at **level 23, "Senior-Track"**, and reaches "Mid II — reviews others" around halfway.
7. **The unlock rules contradict the README.** Unlocking is linear within a chapter, and a 3-lesson chapter needs 3/3 to reach 70% (2/3 = 0.667). So "one lesson you bounce off never walls off a whole chapter" only holds when the lesson you bounce off is the last one.

---

## Findings

### 1. [bug, high] Double reward on concurrent submits of the same lesson
**Evidence:** `index.ts:338` `const alreadyPassed = rec.status === 'passed';` is evaluated before `await runExercise(...)` (`index.ts:346`), then trusted at `:357` and `:360` (`if (result.ok && !alreadyPassed) rewards = applyPass(...)`).

**Repro:** two parallel `POST /lesson/js-closure-state/submit` calls with correct code returned `rewards.xp.total` of **63 and 50**. Profile XP was 178 = 63 + 50 + 25 (First Blood) + 40 (`grind-2`, completed by one lesson counted twice). `day.lessons`, `stats.passes`, `attempts` and history were also doubled.

**Why it matters:** Ctrl+Enter key-repeat, a double click before React re-renders, or two tabs can all trigger it (the `busy` check in the keydown effect at `Lesson.tsx:201` reads a stale closure).

**Fix:** grade outside the critical section, then re-read state after the `await`. The code after the last `await` runs synchronously, so that is enough. Add a per-lesson in-flight guard as well.
```ts
const inFlight = new Set<string>();
// submit
if (inFlight.has(id)) return res.status(409).json({ error: 'Already grading this lesson' });
inFlight.add(id);
try {
  const result = await grade(loc, req.body);        // no state reads before this
  const rec = store.record(p, id, !!loc.lesson.boss);
  const alreadyPassed = rec.status === 'passed';     // read AFTER the await
  ...
} finally { inFlight.delete(id); }
```

### 2. [bug, high] Async handler errors crash the server; parse errors leak stack traces
**Evidence:** Express 4 does not catch rejected promises from `async` handlers. `String(req.body?.code ?? '')` at `index.ts:276`, `:318` and `:344` throws `TypeError: Cannot convert object to primitive value` for `{"code":{"toString":1}}`. `Number(a)` in `gradeQuiz` (`index.ts:385`) throws for the same kind of object.

**Repro:** server log `TypeError ... at index.ts:276:61`, then the process exited, and `/health` then failed. A body of `{bad` returns 400 with `<pre>SyntaxError ... at JSON.parse ... body-parser/lib/...`, because finalhandler prints stacks when `NODE_ENV !== 'production'`.

**Why it matters:** the whole app goes down, and any mutation since the last save is lost. A request that throws never sends a response, so the UI hangs.

**Fix:** validate the input types, wrap handlers, and install a JSON error handler. (Alternatively, Express 5 forwards rejected promises natively.)
```ts
const h = (fn: RequestHandlerAsync) => (req, res, next) => fn(req, res).catch(next);
const str = (v: unknown, max = 60_000) => {
  if (typeof v !== 'string') throw new HttpError(400, '`code` must be a string');
  if (v.length > max) throw new HttpError(413, `code is over ${max} chars`);
  return v;
};
app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal error' : err.message });
});
```
Apply one cap everywhere. Today only `/draft` slices to 60k; `/run` and `/submit` store drafts of up to ~1 MB (`index.ts:319`, `:345`) and rewrite the whole save file with them on every click.

### 3. [bug, high] `/solution`, `/hint`, `/run` ignore the lock; the sandbox can read every solution
**Evidence:** only `/submit` checks `lessonUnlocked` (`index.ts:335`). `/hint` (`281–300`), `/solution` (`302–311`), `/run` (`314–329`) and `/draft` do not.

**Repro (fresh save):**
- `POST /lesson/js-task-queue/solution` returned 200 with the full 1,694-char reference solution.
- `/hint` returned hint 1.
- `/run` executed the locked lesson's graders and returned test names such as "TaskQueue basics › respects the concurrency limit", with error messages.
- These calls also create `status: 'attempted'` records for locked lessons, which then drive `nextUp` (finding 12).

Separately, learner code run through `/run` executed `readFileSync(process.cwd() + '/content/js/index.ts')`. It returned 83 KB, including `solution: \`export function createCounter...`, and it also read `data/progress.json` (3,556 bytes). The comment at `runner/index.ts:82` ("Learner code should not be able to read the progress file") is false: `env: { NODE_ENV: 'sandbox' }` limits environment variables, not the filesystem. The same code can *write* the save file too.

**Fix:** add a `requireUnlocked` guard on hint, solution, run and draft. For the sandbox (runner reviewer's scope, but it breaks this layer's promise): run grading in a child process under Node's permission model, `node --permission --allow-fs-read=<runDir>,<node_modules> --allow-fs-write=<runDir>`. Worker threads cannot get their own fs permissions.

### 4. [bug, high / security] The API binds to 0.0.0.0 and accepts any Host header
**Evidence:** `index.ts:439` `app.listen(PORT, ...)` has no host argument. Windows prompts the user to "Allow" on first run, and many people click it.

**Why it matters:** `/run` is arbitrary code execution with filesystem access (finding 3), so anyone on the same café Wi-Fi can run code on the learner's machine. A DNS-rebinding page can reach it even through a firewall: the requests become same-origin, so the JSON content-type requirement no longer blocks them.

**Fix:**
```ts
app.listen(PORT, '127.0.0.1');
app.use((req, res, next) =>
  /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? '') ? next() : res.status(421).end());
```

### 5. [bug, high] `load()` turns any read or parse error into a fresh save, and the next save clobbers the file
**Evidence:** `progress.ts:82–84` `catch { cache = fresh(); }`. It catches ENOENT, but also:
- EBUSY/EPERM, when Windows antivirus or the indexer is holding the file;
- a typo from a hand edit;
- a truncated file after a power loss (see finding 6: no fsync).

After that, `GET /state` calls `store.save()` (`index.ts:262`). The first page load after a transient read error permanently replaces weeks of progress with an empty save.

**Fix:**
```ts
} catch (e: any) {
  if (e.code === 'ENOENT') { cache = fresh(); }
  else {
    const quarantine = FILE.replace(/\.json$/, `.corrupt-${Date.now()}.json`);
    await rename(FILE, quarantine).catch(() => {});
    cache = (await loadNewestBackup()) ?? fresh();
    console.error(`[progress] could not read save (${e.message}); moved to ${quarantine}`);
  }
}
```

### 6. [bug, medium] Save durability and multi-process safety
- **No fsync before rename** (`progress.ts:95–96`). On NTFS or ext4, a crash can leave a zero-length `progress.json`, which then triggers finding 5. Write through a `FileHandle` instead: `open`, `writeFile`, `sync()`, `close`, then `rename`.
- **Save failures are swallowed** (`progress.ts:97–99`). The client has already received its 200, because every handler calls `res.json()` *before* `await store.save()` (`index.ts:262, 278, 299, 310, 328, 381`). On Windows, `rename` onto an existing file fails intermittently with EPERM/EBUSY. Retry with backoff (0/50/200/800 ms), and save *before* responding on mutating routes (it is a local disk, so this costs about a millisecond).
- **No coalescing.** Every `GET /state` queues a full rewrite, even though it only mutates on a day rollover. Use a dirty flag and a single pending write.
- **Two processes, one file.** The fixed tmp name `progress.json.tmp` and a per-process `cache` mean that running `npm run dev` and `npm start` together, or e2e on another `PORT`, clobbers progress: the last writer wins with its own stale view. Read `DATA_DIR` from the environment (and make e2e use a temp dir), and add a `data/.lock` containing the PID, checked on startup.
- **Shallow default-merge** (`progress.ts:77`). `{ ...fresh(), ...parsed }` does not default nested fields (`stats.*`, `streak.freezes`, `days[*].kinds`), and `version` is never read. See "Persistence additions".

### 7. [bug, medium] Quest rollover: a stale board mid-session, and XP silently withheld
**Evidence:** the board rolls only in `load()` (`progress.ts:79`) and `questBoard()` (`index.ts:64`). `applyPass` → `syncQuests` (`index.ts:205`) evaluates *today's* counters (`store.today(p)`) against `p.daily`, which can be *yesterday's* board. `questBoard` calls `syncQuests(p)` and **discards the returned list** (`index.ts:65`). Any quest it completes is set to `done = true` and never paid.

**Scenario:** load the dashboard at 23:50, then pass a boss at 00:10. Yesterday's board is evaluated against today's counters. At the next `/state`, the board rolls and a `boss-1` quest is immediately marked done, **without its 120 XP**.

**Fix:** a single `ensureDay(p, now)` at the start of every request (see the refactor plan), and a single `awardQuests(p, now)` that both marks and pays. `questBoard` becomes a read-only projection.

### 8. [bug, medium] Each request computes the day and time from several `new Date()` calls
**Evidence:** `dayKey()` is called independently in `store.today` (`progress.ts:118`), `bumpStreak` (`gamify.ts:112`) and `questBoard` (`index.ts:64`). `solvedAt` and `achievements[...]` use their own `new Date()`.

**Why it matters:** a submit that starts at 23:59:55 and finishes grading after midnight (grading can take up to 25 s for SQL) can file the lesson under one day and the streak under another.

**Fix:** take `const now = new Date()` once, **after** grading, and pass it everywhere: `dayKey(now)`, `bumpStreak(p, dayKey(now))`, `solvedAt: now.toISOString()`. This also makes the rules testable with a fake clock.

### 9. [bug, medium] The streak display goes stale, and time-zone travel resets the streak
**Evidence:**
- `profile.streak` returns `p.streak` as stored (`index.ts:44`). `current` only changes on a pass, so after a week away the dashboard still shows a 12-day streak until the next pass. That contradicts the README's "the app never lies about the streak".
- `bumpStreak` (`gamify.ts:112–127`): if `today < lastDay` (flying west, or a clock fix), no branch matches, so the streak resets to 1 and `lastDay` moves backwards.
- A freeze covers exactly one missed day (`gamify.ts:121`), so holding 3 freezes never helps with a 2-day gap. Stockpiling is pointless.

(The DST handling is correct: `dayBefore` anchors at local noon.)

**Fix:**
```ts
export function effectiveStreak(s: Streak, today: string) {
  if (!s.lastDay) return { ...s, current: 0, atRisk: false };
  const missed = daysBetween(s.lastDay, today) - 1;
  if (missed <= 0) return { ...s, atRisk: false };           // today, yesterday, or clock went back
  return missed <= s.freezes ? { ...s, atRisk: true } : { ...s, current: 0, atRisk: false };
}
// bumpStreak: if (today <= s.lastDay) no-op; if missed <= freezes, consume `missed` freezes.
```

### 10. [bug, medium] Achievements: orphan records make "Mid-Level" unreachable, and "recomputed, not trusted" is only half true
**Evidence:**
- `buildCtx.passed` (`index.ts:109`) is every passed record in `p.lessons`, including ids no longer in the curriculum. `mid-level` uses `c.passed.length === c.totalLessons` (`gamify.ts:265`). After one lesson is renamed, 73 ≠ 72 and the **1,000 XP badge can never be earned**. `profile.lessonsPassed` (`index.ts:32`) is inflated the same way. The README tells authors to edit the curriculum freely.
- Badges are awarded only inside `applyPass`. `achievementBoard` computes `eligible` (`index.ts:101`), but nothing ever grants an eligible badge that hasn't been earned. So the README's "editing the curriculum cannot strand one" is only true for display.
- Secret achievements send their full `title` and `detail` to the client (`index.ts:92–102`). They are only secret if the UI chooses to hide them.

**Fix:**
- Filter `passed` to ids that `locate()` finds.
- Define `mid-level` as "every current lesson passed".
- Run an idempotent `reconcileAchievements(p, now)` after `load()` and after every mutation.
- Redact unearned secret badges to `{ id, secret: true }`.

### 11. [bug, medium] The unlock rules don't match the README
**Evidence:** `lessonUnlocked` (`content.ts:55–63`) requires lesson *i−1* to be passed, and `chapterUnlocked` requires `done / n >= 0.7` (`content.ts:52`). Chapter sizes are 5/5/3/2, 4/4/4, 5/4/3, 4/4/4, 4/5/4 and 4/4:
- In a 5-lesson chapter, bouncing off lesson 2 locks lessons 3, 4 and 5, so the chapter tops out at 1/5 and the next chapter stays locked. **Only the final lesson can ever be skipped.**
- `js-data` has 3 lessons, and 2/3 = 0.667 < 0.7, so `js-errors` needs **100%** of it.
- A chapter with 0 lessons evaluates `NaN >= 0.7`, which is false, so it is locked forever.

**Fix:** implement what the README says, "all but one".
```ts
const SKIPS = 1;
export function lessonUnlocked(id: string, p: Progress) {
  ...
  const before = loc.chapter.lessons.slice(0, loc.index);
  return before.filter((l) => !passed(p, l.id)).length <= SKIPS;
}
export function chapterUnlocked(track: Track, i: number, p: Progress) {
  if (i === 0) return true;
  const prev = track.chapters[i - 1].lessons;
  return prev.length === 0 || prev.filter((l) => passed(p, l.id)).length >= prev.length - SKIPS;
}
```
If bosses must never be skipped, exclude `boss` lessons from the skip budget.

### 12. [bug, medium] `nextUp` pins "Continue" to the lesson the learner gave up on
**Evidence:** `content.ts:84` returns the first lesson that is `attempted` and unlocked, in curriculum order. `attempted` is also created by `/draft`, `/run` and `/hint` without any submit (`index.ts:276, 286, 319`). A stuck JS lesson keeps "Continue" pointing at it for the rest of the course, even after the learner has moved to React. Autosave on a lesson they merely opened also steals "Continue".

**Fix:** store `lastTouchedAt` on the record. `nextUp` then picks:
1. the most recently touched unpassed, unlocked lesson, if it was touched within 48 h;
2. otherwise, the first unlocked, unpassed lesson after the most recent pass, in the same track.

Reserve `attempted` for real submits; draft-only records stay `new`.

### 13. [bug, medium] Actions after a pass change scoring stats retroactively; a failed review resets the combo
**Evidence:**
- `/hint` after passing increments `rec.hintsUsed` (`index.ts:288`), and `/solution` after passing sets `rec.solutionRevealed = true` (`index.ts:307`). Both feed `no-net` (`gamify.ts:235`) and `chapterStats.allFirstTry` (`content.ts:69`). Comparing your answer with the reference, which the app should encourage, removes a chapter's Flawless eligibility.
- Re-submitting an already-passed lesson with failing code sets `p.combo = 0` (`index.ts:362–363` runs whether or not `alreadyPassed`). Practising from the pristine starter is punished.

**Fix:** freeze scoring at pass time (`rec.pass = { attempts, hintsUsed, solutionRevealed, at }`), and send post-pass reveals to `rec.review`. Reset the combo only when `!alreadyPassed`.

### 14. [bug, low] Quiz: explanations leak on failure, so `/quiz/:id/explain` gating does nothing
**Evidence:** `gradeQuiz` returns `error: question.explain` for every wrong question (`index.ts:393`), and explanations usually state the answer. Meanwhile `/quiz/:id/explain` returns 403 until the quiz is passed (`index.ts:404`). So attempt 1 is "answer all zeros, read the explanations" and attempt 2 passes. Options are never shuffled.

Scale: the whole Engineering Craft track is 7 of 8 quizzes, including the "3am incident" boss (200 XP, plus the 300 XP track badge).

The grading itself is correct: answers are order-insensitive, duplicates fail, NaN never matches, and there is no partial credit. `/run` on a quiz returns "The grader registered no tests (lesson bug)" (confirmed); it should return 400.

**Fix:**
- On failure, return `{ name, passed: false }` plus a count ("2 of 7 wrong"), with no explanation.
- Offer explanations through "Show explanations", priced like a solution reveal (20% cap), and always show them after a pass.
- Shuffle option order per attempt with a stable seed stored on the record, and map indexes back on submit.

### 15. [bug, low] `xpAtStake` quotes numbers the learner can no longer earn
- After a failed submit, `computeXp({ attempts: rec.attempts, ... })` (`index.ts:377`) gets `attempts = 1`, so it treats the next pass as first-try. Repro: `js-once-memoize` (base 60) quoted **75** after a failure; the next pass pays 60. Use `rec.attempts + 1`.
- The `/hint` quote hard-codes `solutionRevealed: false` (`index.ts:296`), which is wrong after a reveal.
- `/solution` quotes `xpIfPassed` even when the lesson is already passed and nothing will be paid.
- `computeXp` for a revealed solution reports the same deduction twice, as both `hintPenalty` and `solutionPenalty` (`gamify.ts:71–72`). A UI that sums penalties shows −160%. Set `hintPenalty: 0` in that branch.

### 16. [nit] Small items
- `nextRankFor` hard-codes `[1,3,5,8,11,14,18,22]` (`index.ts:58`), duplicating `RANKS` (`gamify.ts:25`). Export `RANKS` and derive the list.
- In `--prod`, `app.get('*')` (`index.ts:433`) serves `index.html` with a 200 for unknown `GET /api/...`. Add a JSON 404 at the end of the `api` router.
- `runExercise` has no concurrency cap. Each worker gets `maxOldGenerationSizeMb: 512`, so ten parallel runs could use ~5 GB. A semaphore of 2 is enough.
- `readiness` rounds per-track percentages and then rounds again (`gamify.ts:286–291`). Compute from fractions.
- `syncQuests` treats any unknown metric as `kind` (`index.ts:80`). Make the switch exhaustive with a `never` check.
- `/reset` can't be undone. Write `progress.pre-reset-<ts>.json` first.
- There are no unit tests for `gamify.ts`, even though it is pure. e2e covers only happy paths: no concurrency, no lock checks on hint/solution/run, no rollover, streak, persistence reload or malformed input.

---

## Economy tuning

### Worked numbers (from the real `computeXp` and curriculum)

Level cost is `100 + 50(n−1)`, so the XP needed to *reach* level N is `100(N−1) + 25(N−1)(N−2)`:

| Level | Rank | Cumulative XP |
|---|---|---|
| 3 | Junior II | 250 |
| 5 | Junior III | 700 |
| 8 | Mid-Track | 1,750 |
| 11 | Mid I | 3,250 |
| 14 | Mid II | 5,200 |
| 18 | Mid III | 8,500 |
| 22 | Senior-Track | 12,600 |

XP sources:
- **Lessons:** 6,785 base. The 8 bosses total 1,740, and the 10 quizzes total 795.
- **Achievements:** 24 badges, **5,085 XP**. 3,965 of that is guaranteed just by finishing: counts, kinds, six tracks, and Mid-Level at 1,000.
- **Quests:** 3 a day, worth up to 320 and on average about 225 if all are completed.

Simulation, all 72 lessons in order, with a deterministic RNG:

| Scenario | Lesson XP | Quests | Achievements | **Total** | Final level / rank |
|---|---|---|---|---|---|
| Floor: never first-try, no hints, no quests | 6,785 | 0 | 3,965 | **10,750** | **L20, Mid III** |
| Typical: 55% first-try, 40% use 1–2 hints, 5% reveals, ~110 quest XP/day over 29 days | 6,930 | 3,190 | 4,485 | **14,605** | **L23, Senior-Track** |
| Run-then-Submit (always first try, max combo) | 10,151 | 3,840 | 4,985 | **18,976** | **L27, Senior-Track** |

Lesson XP only, typical run: L4 at 10% complete, L7 at 25%, L11 at 50%, L14 at 75%, L16 at 100%. Once achievements and quests are added, the typical learner reaches **Mid-Track at about 25% readiness and Mid II ("reviews others") at about 50%**.

Conclusions:
1. **More than half of all XP is meta.** In the typical run, 7,675 XP comes from badges and quests versus 6,930 from lessons. The meta mostly re-pays completion that lessons already paid for; the six track badges and Mid-Level alone are worth 2,800.
2. **The rank ladder overshoots the curriculum.** Even the floor scenario ends at Mid III, and the typical run ends at Senior-Track. A rank that means "Senior" after a junior→mid course is dishonest, and a learner who notices stops trusting the other numbers.
3. **Honest play earns less than gaming Run.** Run is consequence-free and runs the full grader, so the optimal strategy is to Run until green and then Submit. That yields +46% lesson XP, a permanent ×1.25 combo, trivially Flawless chapters, and a free "clean-2" quest. The README says "reading the brief properly pays better than guessing"; the code rewards the opposite.
4. **Some hints are free.** With `HINT_PENALTY = 0.12` and a 0.5 floor, 4 hints cost 48% and the 5th and later hints cost nothing. 13 lessons have 6–8 hints, and the last hints are the most revealing.
5. **Some quests become impossible, and quests stop paying.** `sql-2`, `react-2` and `types-2` are still drawn after that track is finished, and `boss-1` is drawn when no boss is reachable. After 100% completion, nothing earns XP at all.

### Concrete re-tune

**A. Make "first try" mean something.** Pick one:
- *(Preferred)* Split graders into visible and hidden tests. Add an `it.hidden(...)` in the harness, or `hiddenTests?: string` on `Lesson`. Run executes the visible tests only; Submit executes all of them. First-try means the full suite passed on the first Submit. This is how real CI and take-homes work.
- *(Cheaper)* Drop the first-try bonus and the combo. Replace them with a **clean bonus**: +20% if no hints and no reveal, regardless of Run count. It is honest, and it removes the incentive to guess.

**B. Scale the hint cost to the lesson.** Each hint costs `0.5 / hintCount` of base, so all hints together always cost 50% and no hint is free. Keep the solution reveal at 20% and the combo reset.

**C. Shrink the meta to about 35% of lesson XP.** Target totals: achievements ≈ 1,400 and quests ≈ 40/day.

| Achievement | Now | Proposed |
|---|---|---|
| first-blood / ten / 25 / 50 | 25 / 60 / 120 / 250 | 10 / 25 / 40 / 60 |
| chapter-clear / flawless / boss-slayer / no-net / comeback | 80 / 200 / 150 / 130 / 60 | 30 / 75 / 50 / 50 / 30 |
| streak 3 / 7 / 30 | 50 / 140 / 500 | 15 / 35 / 100 |
| 4 kind badges | 120 each | 40 each |
| 6 track badges | 300 each | 80 each |
| mid-level | 1,000 | 250 |
| night-shift | 40 | 10 |
| **Total** | **5,085** | **1,420** |

Proposed quest rewards: grind-2 15, grind-4 35, xp-150 20, xp-300 40, clean-2 25, nohint-3 30, boss-1 50, kind-2 25.
- Only draw quests that can be completed: enough unlocked or unlockable unpassed lessons of that kind remain, and a boss is reachable.
- Add review quests (E below), so quests keep working after 100%.

**D. Keep the level curve and decouple rank from XP.** With C in place:
- typical total ≈ 6,900 + 1,400 + 1,150 ≈ 9,450, which is **L19**;
- floor ≈ 7,900, which is **L17**;
- max play ≈ 12,000, which is **L21**.

Levels then land in a sane L17–21 band at completion, as pure progress feedback.

**Rank** should measure skill: derive it from *mastery readiness* (F), not XP.

| Rank | Mastery readiness |
|---|---|
| Junior I | 0 |
| Junior II | 10% |
| Junior III | 25% |
| Mid-Track | 40%, plus at least 1 boss |
| Mid I | 55%, plus a boss in 3 or more tracks |
| Mid II | 70%, plus every track at 50% or more |
| Mid III | 85%, plus all 8 bosses |
| **Mid-Level** | 100% passed, mastery ≥ 0.8, no reviews overdue |

Remove "Senior-Track": this curriculum can't certify it. If you want an aspirational tier, label it "Beyond this curriculum".

**E. Add a spaced-repetition review loop.** This is the biggest real motivation gain.
- After a pass, schedule reviews at +3, +10 and +30 days, using Leitner boxes on the record (`review: { box, dueDay }`).
- A review is the lesson re-graded from the pristine starter, with quiz options reshuffled.
- A review pays 15% of base, with no combo or attempt side-effects.
- A pass moves the lesson up a box; a failure drops it to box 1 and lowers mastery. Nothing else is lost.
- Only then does "Mid-Level" mean "can still do it", not "did it once".
- The quest pool gets `review-2` ("Clear 2 due reviews", 30).

**F. Make readiness measure mastery, not completion.**
```ts
mastery(rec) = !passed ? 0
  : rec.pass.solutionRevealed ? 0.35
  : clamp(1 - 0.08 * rec.pass.hintsUsed - 0.04 * Math.max(0, rec.pass.attempts - 2), 0.6, 1)
    * (reviewOverdue(rec) ? 0.85 : 1);          // restored by passing the review
trackReadiness = Σ xp_l · mastery_l / Σ xp_l    // XP-weighted, so a boss counts ~4× a warm-up
overall        = Σ weight_t · trackReadiness_t / Σ weight_t
```
Today, a lesson passed by pasting the revealed solution counts 100% toward "readiness", and a 50-XP warm-up counts the same as a 260-XP boss. The track weights (0.9–1.1) are close enough to 1 that they do nothing; either justify them or remove them. Show two numbers, **Completion** and **Mastery**, with Mastery as the headline.

**G. Detect weak spots.** Every track's content file sets `tags`, and the model comment says they are "surfaced in the skill report", but the server never aggregates them; the UI only lists them. Compute per-tag mastery: the mean over the lessons carrying the tag, penalised by attempts, hints and reveals. Return the 3 weakest tags in `/state`, each with a suggested lesson to review. It is cheap, and it turns failures into direction instead of just lost XP.

**H. Streak freezes.** Keep "1 per 5 days, max 3", but let a gap of k missed days consume k freezes (finding 9), and show the streak as "at risk" rather than as a stale number.

---

## Persistence additions (the JSON file stays)

1. **Versioned migrations.** `version` is written but never read.
   ```ts
   const CURRENT = 2;
   const MIGRATIONS: Record<number, (raw: any) => any> = {
     1: (r) => ({ ...r, version: 2, lessons: mapValues(r.lessons, addPassSnapshot) }),
   };
   while ((raw.version ?? 1) < CURRENT) raw = MIGRATIONS[raw.version ?? 1](raw);
   cache = deepDefaults(raw, fresh());
   ```
2. **Distinguish missing from corrupt** (finding 5): quarantine the file, restore from the newest backup, and log loudly.
3. **Durable writes:** `open → write → fsync → close → rename`, with EPERM/EBUSY retry, and coalesced through a dirty flag. Save before responding.
4. **Backup rotation:** on the first save of each local day, copy to `data/backups/progress-YYYY-MM-DD.json` and keep 14. Always back up before `/reset`, `/import` and any migration.
5. **Single-writer lock:** `data/.lock` holding `{ pid, startedAt }`. On startup, refuse, or warn and go read-only, if that PID is still alive. Read `DATA_DIR` from the environment so `test:api` and `test:ui` use a temp directory instead of wiping the real save.
6. **Import/export:**
   - `GET /api/export` sends the save as a download.
   - `POST /api/import` validates `version` and shape, backs up the current save, migrates the import, then swaps it in.

   This matters for the README's "survives a USB stick".
7. **Move drafts out** to `data/drafts/<lessonId>.txt`, or at least cap them at 60k everywhere. Then the save that gets rewritten on every click stays small and diff-friendly.

---

## Structure

### Split `index.ts`
```
server/
  main.ts                 listen('127.0.0.1'), static/--prod, sweepRunsDir
  app.ts                  createApp({ store, runner, clock }) — testable without a port
  http/
    middleware.ts         asyncHandler, hostGuard, errorHandler, JSON 404 for /api
    validate.ts           str(), answers(), lessonParam() → { loc } or 404, requireUnlocked
    routes/state.ts       GET /state
    routes/lesson.ts      GET /lesson/:id, POST draft|hint|solution|run|submit
    routes/quiz.ts        GET /quiz/:id/explain
    routes/admin.ts       reset, export, import, health
  services/
    session.ts            withProgress(now, fn): load → ensureDay → fn → reconcile → save
    submission.ts         grade(loc, body) (sandbox or quiz), per-lesson in-flight guard
    rewards.ts            applyPass (today index.ts:171–244), awardQuests, reconcileAchievements
    quiz.ts               gradeQuiz, shuffle/unshuffle
  projections/
    profile.ts  trackTree.ts  achievementBoard.ts  publicLesson.ts (moved from content.ts)
  domain/                 (split gamify.ts; all pure, all take `now`/`today` explicitly)
    levels.ts  ranks.ts  economy.ts  streak.ts  quests.ts  achievements.ts  mastery.ts
  store/
    progress.ts  migrations.ts  backups.ts
shared/
  api.ts                  request/response types
```
`index.ts` today mixes four concerns: projections (lines 26–155), the reward pipeline (157–244), routes (246–420) and bootstrap (424–445). Each of these moves into one directory above.

### Shared types
`web/src/api.ts` redeclares about 15 interfaces that "mirror server/index.ts", and they have already drifted: the web `Quest` has no `metric`/`kind`, and `days` is narrowed to `{ lessons, xp }`. Fix:
- Create `shared/api.ts` exporting `StateResponse`, `LessonDetail`, `SubmitResponse`, `Rewards`, `RunResult`, `Profile`, and so on. `RunResult` and `TestResult` move there from `runner/index.ts`; `LessonKind` is re-exported from `content/types.ts`.
- Projections declare their return types (`function profile(p: Progress): Profile`), and routes use `res.json(body satisfies StateResponse)`. Drift then becomes a compile error.
- The web imports them with `import type { ... } from '../../shared/api'`. Type-only imports are erased, so Vite's `root: 'web'` needs no `fs.allow` change, and `tsconfig.include` already covers both halves.
- Distinguish the wire `LessonStatus` (`'new' | 'attempted' | 'passed'`) from the stored one. Add the `pass` snapshot, `review` and `lastTouchedAt` to `LessonRecord`.
- In `content/types.ts`, support hidden tests (economy A), and make `Track.weight` optional with a default of 1 until it is justified.

---

## Proposed refactor plan (in order)

1. **Stop the bleeding** (small, one PR):
   - bind to 127.0.0.1 and add the Host guard;
   - add `asyncHandler` and a JSON error handler;
   - type-check `code` and `answers`, and cap them at 60k;
   - add `requireUnlocked` on hint, solution, run and draft;
   - re-read `alreadyPassed` after grading, plus the per-lesson in-flight 409;
   - reset the combo only when `!alreadyPassed`;
   - fix the `xpAtStake` quotes.

   Add e2e cases for each: parallel submit, `{code:{}}`, locked `/solution`, bad JSON.
2. **Persistence safety:**
   - ENOENT versus quarantine in `load`;
   - fsync plus retrying rename;
   - save before responding;
   - daily backups plus a pre-reset backup;
   - `DATA_DIR` env and a lockfile, with e2e pointed at a temp dir.
3. **Clock and day handling:** a single `now` per request, `ensureDay` inside a `withProgress` wrapper, and `awardQuests` as the only place that marks quests done. Add `effectiveStreak`, the backward-clock guard and multi-freeze handling.
4. **Unit-test the domain:** move `gamify.ts` into `domain/*`, then add pure tests for `computeXp`, `levelFromXp`, `bumpStreak` (DST, travel, freezes) and `seededPick` stability.
5. **Extract services and projections** from `index.ts` as laid out above, and create `shared/api.ts` so the web imports it.
6. **Achievement integrity:** filter orphan records, run `reconcileAchievements` on load, redact secrets, and freeze the `pass` snapshot, with a v1→v2 migration that backfills it from the existing fields.
7. **Unlock rule:** switch to "all but one per chapter", with tests against the real chapter sizes, including the 3-lesson `js-data`. Fix `nextUp` with `lastTouchedAt`.
8. **Economy re-tune:** proportional hint cost, the rescaled achievement and quest tables, and attainable-only quests. Then either visible/hidden tests (content work across 62 graded lessons) or the "clean bonus" fallback.
9. **Mastery, rank and review:** the `mastery` function, rank derived from mastery, the review queue with Leitner boxes, the `review-2` quest, and per-tag weak spots in `/state`.
10. **Import/export** endpoints and moving drafts out of the save file.

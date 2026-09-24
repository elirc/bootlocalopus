# Review 06 — `ROADMAP-draft.md` (junior→senior programme)

Reviewer: Fable · 2026-09-23 · Scope: `upskilling/ROADMAP-draft.md` (1,144 lines,
26 missions, 24-row defect appendix) checked against `README.md`, `server/`,
`web/src/`, `content/types.ts`, `scripts/`, `package.json`, `dist/`, and
`upskilling/journal/001`. No code was modified. The result is
`upskilling/ROADMAP.md`.

Method: read every cited file end to end; re-derived the XP arithmetic with a
script; checked `dist/assets/` on disk; grepped for the claims that are easy to
fabricate (`fsync`, `SIGINT`, `version`, `esbuild`, `listen(0`, `toBeLessThan(`).
I did not run `test:sandbox` or `verify`, because both call `sweepRunsDir()` on
exit, which Review 05 showed deletes other processes' in-flight runs, and
another agent was using the checkout (a fresh `.runs/<uuid>` appeared at 14:02
and `web/src/` was being rewritten while I worked). Timing numbers in the draft
are therefore marked *reported*, not verified.

## Verdict in one paragraph

The draft is well grounded. Of 24 appendix rows, 21 are correct as written, 2
have a wrong number or an overstated claim, and 1 attributes the wrong
mechanism to a real symptom. None is invented. The missions are mostly
senior-calibre; five are mid-level work with senior framing and were merged or
cut. The competency model was already mostly behavioural; eight cells were
adjectives and are rewritten. The reading list is entirely real; one
attribution was wrong and two items went with a cut mission. Four things a
staff engineer would expect were missing: an explicit ADR review, estimate
calibration, a mentoring loop with an adversarial review of someone else's
lesson, and a scope cut practised mid-mission. All four are now in.

---

## 1. Grounding

### Missions spot-checked (14 of 26)

| Draft mission | Verdict | Evidence |
| --- | --- | --- |
| 02 Tests tell the truth | GROUNDED, one nuance | `smoke.ts:119–120`: `expectedOk` is true only for pass-labelled cases and four named ones; the fail/timeout/compile cases are printed but never asserted. `gamify.ts` has no test file anywhere in the repo. Nuance the draft misses: `e2e.ts:80` asserts `phase === 'compile'` and `:86` asserts `timedOut`, so those are covered, just not in `npm test`. Now stated. |
| 03 CI | GROUNDED | `e2e.ts:38` posts `/api/reset`; `progress.ts:11` fixes `DATA_DIR`. `ui-smoke.mjs:9` imports `esbuild`; not in `package.json`; present in `node_modules` via Vite. No `.github/` directory exists. |
| 04 UI race | GROUNDED (at HEAD) | `Lesson.tsx:14–18` effect with no cleanup; Reset at `:226`; `content.ts:102` `starter: rec?.draft ?? lesson.starter`; `App.tsx:60–62` refetch on route change. Note: an uncommitted rewrite of `Lesson.tsx` on disk now has an `ignore` flag. Flagged in the roadmap. |
| 05 Double submit | GROUNDED for `/submit`; the `/hint` claim is wrong | `index.ts:338` `alreadyPassed` read, `:346` `await runExercise`, `:360` `applyPass` guarded only by that stale boolean. Same `cache` object for all requests (`progress.ts:69,73`). `/hint` (`:281–300`): the only `await` before the increment is `store.load()`, which returns the cached object; the read at `:287` and the write at `:288` are synchronous. There is no race there. The draft's "milder version of the same problem" is an unverified extrapolation. Corrected, and kept in the appendix as row 26 so the learner sees an inherited claim that did not survive checking. |
| 07 Durability | GROUNDED | `progress.ts:82–84` catch-all → `fresh()`; `:89–101` temp+rename, no `fsync`, `.catch` logs; `:77` shallow spread; `version: 1` at `:56` and `grep version server/` finds no reader. Every route: `res.json(...)` then `await store.save()`. |
| 08 Async errors | GROUNDED, scope narrowed | Express `^4.21.2`; async handlers everywhere; no error middleware. Reachable rejection paths today are narrow: `store.load()` cannot throw, `locate` cannot throw, so it is `mkdir` at `runner/index.ts:72` and little else. Unlock: `lessonUnlocked` is called in a handler exactly once (`:335`). The draft listed `/hint` and `/solution`; `/run` and `GET /lesson/:id` also skip it, and the latter returns the brief for a locked lesson. Added. |
| 10 Shutdown | GROUNDED | No `SIGINT`/`SIGTERM` anywhere in `server/`. `cleanupRunDir` is `void`ed at `:144`. |
| 11 Threat model | GROUNDED by reading; probes *reported* | Learner import at `worker.mjs:547` in the thread that owns `parentPort`; parent accepts first non-progress message at `runner/index.ts:114–119`. Globals at `:292`, spec at `:556`, `results.every` at `:586`. `env:` at `:83` only sets `process.env`; comment at `:82`. `app.listen(PORT)` at `index.ts:439`, no host. `bits.tsx:13` `dangerouslySetInnerHTML`, comment at `:10–11`. Node `--permission` is process-wide: correct. |
| 12 Admission | GROUNDED; timing *reported* | No semaphore in `runner/index.ts`; `resourceLimits` at `:84`; `started` at `:73` before `new Worker`; `MAX_LOGS = 200` by count at `worker.mjs:40,50`. |
| 13 Parallel tests | PARTLY: count wrong | `verify-content.ts:163–205` is serial. But quizzes `continue` at `:171`, so it is 62 code lessons × 2 = up to 124 runs, not 144. Ten `listen(0` calls in `content/node/index.ts` confirm port-0 binding. Eight graders assert `toBeLessThan(` on wall time; the draft did not mention them and they are the first thing that will flake. Added. |
| 14 Worker pool | GROUNDED | `import ts from 'typescript'` at `worker.mjs:13`, top level, before the `kind` branch; `registered`, `rootSuite`, `logs` are module-scope. |
| 16 Layered refactor | GROUNDED | `index.ts` is 445 lines; `nextRankFor` at `:57–58` hard-codes `[1,3,5,8,11,14,18,22]`; `RANKS` in `gamify.ts:25` is not exported; `gradeQuiz` at `:384`. |
| 17 API v2 | GROUNDED on facts; over-engineered as a mission | `api.ts:3` separate `LessonKind`; `api.ts:64` `Quest` lacks `metric`/`kind` (present at `gamify.ts:140–141`); `api.ts:98` `days` has 2 fields vs 6 on the server (extra drift the draft missed). `GET /state` at `index.ts:256,262`. |
| 23 Economy | GROUNDED arithmetic; weak mission | Recomputed: sum of `100+50(n−1)` for n=1..21 is 12,600; achievements sum to 5,085 over 24 entries; 6,785 + 5,085 = 11,870 → level 21; ×1.5 efficiency → level 24. All match. "Mid-Level" at `gamify.ts:264`, "Senior-Track" at `:33`. |
| 24 Upgrades | GROUNDED | Versions as stated in `package.json`. `app.get('*')` at `index.ts:433`; Express 5's path-to-regexp v8 rejects bare `*`. |

Also checked: the reported bundle size 740,795 B matches `dist/assets/index-rZI3FDA-.js` exactly. Node is v24.19.0. `content/node/index.ts` is 3,325 lines. `AUTHORING.md` has a section titled "Escaping, which is the only tedious part" at line 159.

### Appendix defects verified (24 of 24)

| # | Verdict | Note |
| --- | --- | --- |
| 1 | GROUNDED | `index.ts:338` vs `:346`. |
| 2 | GROUNDED | `progress.ts:82–84`. |
| 3 | GROUNDED | `progress.ts:89–101`, `:77`, `:56`. |
| 4 | GROUNDED, narrow today | Reachable paths listed above. |
| 5 | GROUNDED, incomplete | Add `/run` and `GET /lesson/:id`. |
| 6 | GROUNDED | `index.ts:256`, `:262`. |
| 7 | GROUNDED by code; probe *reported* | |
| 8 | GROUNDED by code; probe *reported* | |
| 9 | GROUNDED | `runner/index.ts:82–83`. |
| 10 | GROUNDED | `index.ts:439`. |
| 11 | GROUNDED; 6.8 s figure *reported* | Consistent with Review 05 F5. |
| 12 | GROUNDED | `worker.mjs:13`, `:40`. |
| 13 | GROUNDED with the e2e nuance | |
| 14 | PARTLY | 124, not 144. |
| 15 | GROUNDED | |
| 16 | GROUNDED | |
| 17 | GROUNDED at HEAD; changing on disk | |
| 18 | GROUNDED, plus `days` drift | |
| 19 | GROUNDED | Byte count verified on disk. |
| 20 | GROUNDED | |
| 21 | GROUNDED | |
| 22 | GROUNDED | Arithmetic recomputed. |
| 23 | GROUNDED | `content.ts:25`, `:62`; `gamify.ts:220–227` count orphaned records. |
| 24 | PARTLY: wrong mechanism | The draft says `cleanupRunDir` "races the sweep". The observable debris is better explained by `sweepRunsDir`'s `.catch(() => {})` at `runner/index.ts:19` silently failing on a Windows-locked file while `cleanupRunDir` is still in its backoff loop when the process exits. The more serious bug, from Review 05 F1, is that the sweep deletes other processes' runs. Reframed. |

Two rows added: `npm test` runs `lint:content` in write mode (Review 05 F2, verified against `package.json` and `lint-content.mjs:20`), and the corrected `/hint` claim.

### Numbers the draft got wrong

- Mission summary total: the table sums to **258–396 h**, not the stated
  270–420. The new table is summed by hand and states the overhead separately.
- "144 grading runs": 124.
- "8–12 months at 8 h/week": arithmetically fine, but 8 focused hours every
  week alongside a job is the best case, not the plan. The roadmap now gives
  both numbers with the assumption behind each.

---

## 2. Calibre

### Cut or merged, with reasons

| Draft | Action | Reason |
| --- | --- | --- |
| 02 Tests tell the truth + 03 CI | Merged → **02** | Writing `node:test` cases for pure functions is mid-level work. It becomes senior only when the tests are proved to fail and wired into a pipeline that cannot wipe a save file. Together they are one mission with one point. |
| 04 UI race + 05 double submit | Merged → **03** | Same bug shape on both sides of the wire. The React version is the one the app teaches to mid-level learners; alone it is not a senior mission. Paired with the server race, the senior content (invariant first, deterministic interleaving test, choosing a serialisation strategy) carries both. |
| 07 durability + 10 shutdown | Merged → **05** | Graceful shutdown is a Node-track lesson. Its only senior content is "flush the save on `SIGINT` and prove no partial write", which is a durability criterion. |
| 15 Bundle | Kept, cut to 3–5 h → **12** | Code-splitting a 740 KB localhost bundle is mid-level busywork. What is senior is measuring against a threshold written in advance and being willing to ship "not worth it". Reframed as a time-boxed judgement call. |
| 17 API v2 + 19 content ids | Merged → **14** | A versioned `/api/v2` with a deprecation window for an app with one client is ceremony. The real persisted contract is the save file and the lesson ids. Shared types, side-effect-free reads and the id lockfile are the senior work; "v2" was the costume. |
| 21 `mutation` lesson kind | Demoted to an optional stretch inside **17** | 16–24 h of feature build. Cross-cutting, but it is product work; the senior skill it exercises (a gradeable definition of "good tests") is already exercised by 22's mutation scoring. |
| 23 Economy simulation | Cut; the defect moved to **15** as an ADR candidate | The question "does 100% reach the top rank?" has a closed-form answer, computed above in one line. A 1,000-player Monte Carlo over a deterministic function is theatre. The genuine senior content, a product decision with a save migration, is a one-page ADR. |
| 26 Capstone teach-back | Moved to **20** | Teaching is its own mission, not a footnote to a 50 h capstone. |

### Genuinely senior and kept as-is (light edits)

01 baseline, 06 postmortems (→04), 08 error envelope (→06), 09 observability
(→07), 11 threat model (→08), 12 admission control (→09), 13 parallel verify
(→10), 14 worker pool (→11), 16 layered refactor (→13), 18 ADR (→15,
expanded), 20 storage swap (→16, with the scope-cut criterion), 22 grader
strength (→17), 24 upgrades (→18), 25 review (→19), 26 capstone (→22, trimmed
to 24–40 h).

### Effort

Per-mission ranges in the draft were plausible; the only ones I changed are
merged missions (summed then trimmed 10–20% for shared setup), the bundle
mission (hard-capped), and the capstone (30–50 → 24–40, since the teach-back
left it). New total: **221–336 build hours, ≈265–380 with the per-mission
plan/journal/retro overhead** that the draft charged nowhere. Calendar:
8–11 months at a steady eight hours; 13–18 months at a realistic six with one
week in five lost.

---

## 3. Competency model

Cells rewritten because a reviewer could not point at them:

- CON Junior "Treats `await` as wait here" → observable: "a reported race is
  fixed with a delay or a boolean flag, with no test".
- API Mid "Validates input at the boundary" → "can point at the line where each
  external input enters".
- TST Junior "Trusts a green run" → "a green run is treated as proof".
- OPS Mid "Makes failures loud" → "errors are logged with context and surfaced
  to the user".
- PRF Mid "Knows code-splitting and memoisation" → "can point at the code-split
  boundary or the memoisation and say what it saves".
- SEC Mid "knows OWASP categories, runs `npm audit`" → "`npm audit` in CI; can
  name the OWASP category for each finding".
- COM Mid "Writes READMEs" → "PR links the issue and lists what was tested".
- DEL Mid "Flags risk" → "risks are flagged in the plan".
- DEL Senior: added "and the error is used to adjust the next estimate", which
  is what Mission 21 checks.

Every cell that cited code now cites a line, so the learner can check the
claim in the table itself.

---

## 4. Reading list

All 38 items in the draft are real, published, and findable. Specific checks:

- RFC 9457 is the current Problem Details RFC (obsoletes 7807). Correct.
- Pillai et al., OSDI 2014, full title "All File Systems Are Not Created Equal:
  On the Complexity of Crafting Crash-Consistent Applications". Correct.
- Google Testing Blog, "Flaky Tests at Google and How We Mitigate Them", John
  Micco, 2016. Correct.
- Brandur Leach's idempotency-keys post is at brandur.org/idempotency-keys
  (2017). Correct.
- Tidy First? (Beck, 2023), The Staff Engineer's Path (Reilly, 2022), Staff
  Engineer (Larson, 2021), Observability Engineering (2022). All real.
- *Software Engineering at Google*: Hyrum's Law is in chapter 1, dependency
  management is chapter 21, code review is chapter 9. Chapter names now given.

Changed:

- **Little's Law "via Kleppmann DDIA ch. 1"**: DDIA chapter 1 covers latency
  percentiles and queueing delay but is not where Little's Law is taught.
  Attribution removed; Harchol-Balter kept as the source.
- **REMOVED with Mission 23**: Schell, *The Art of Game Design*; Koster, *A
  Theory of Fun*. Both real; no longer keyed to anything.
- **Added** for the new missions: Ryan Singer, *Shape Up* (scope cutting);
  Greg Wilson, *Teaching Tech Together* (lesson design); Steve McConnell,
  *Software Estimation: Demystifying the Black Art* (calibration). All real and
  well known.

Nothing was marked REMOVE for being unverifiable.

---

## 5. What was added

1. **ADR: write one, defend one, review one (Mission 15).** The draft had an ADR
   to write. It now also requires an adversarial review of the ADR by someone
   arguing for the rejected option, appended to the document, and a review of
   an ADR the learner did not write (the README's "Choices worth explaining",
   treated as three implicit ADRs).
2. **Calibration (Mission 21, run twice).** `upskilling/estimates.md` is kept
   from Mission 01. After Mission 10 and again after Mission 20 the learner
   computes actual ÷ estimate, classifies the overruns, rewrites the remaining
   estimates with a stated rule, and compares the second ratio with the first.
   "Done" criterion 5 requires the final median ratio inside 0.7–1.5 or an
   explanation.
3. **Teach it (Mission 20).** Two lessons from the learner's own missions,
   graded to the Mission 17 threshold, plus an adversarial review of an
   existing boss lesson (can wrong code pass; which sentence is ambiguous; what
   would you change) with at least one fix landed, plus a half-page lesson plan
   for a named mid-level engineer.
4. **Scope cutting mid-mission.** Mission 16 (storage swap) is deliberately
   sized above its budget and requires `upskilling/scope-cuts/016.md` at the
   halfway point or at 1.5× estimate. Mission 22 requires the same. The
   per-mission loop now has a step 4 "scope check" for every mission, the
   journal template has a "Scope" section, and the pre-PR checklist asks for
   it.

---

## 6. Tone

Removed: "You **own this system**", "the missions are built so that those habits
are the only way to meet the acceptance criteria", "Eating your own dog food",
bold emphasis on verbs, and the "hiring manager" framing as a headline. The
opening now addresses the person who wrote `journal/001` and says why that
document is the model. The ground rules tell the learner that the draft's
timing numbers were taken under load and are hypotheses. Every mission's
"why senior" paragraph was cut to the specific judgement it exercises, and the
"what a senior does that a mid does not" line names one behaviour, not a
virtue.

---

## 7. Things I could not settle

- Whether the probes in Mission 08 (result forgery, harness tampering, file
  read) were actually run. The code makes all three obviously possible; the
  draft says "confirmed". Marked *reported*.
- The 88 s vs 36 s smoke gap and the 6.8 s trivial run. Not reproduced, for the
  reason given at the top. Mission 01 exists to settle them.
- The state of `web/src/`. An uncommitted rewrite appeared during the review
  (new `pages/lesson/` directory, `ApiError`, `useDocumentTitle`, a `mutation`
  kind in `KIND_LABEL`, an `ignore` flag in the lesson effect). Appendix rows
  17–19 and Missions 03, 12, 14 describe the committed tree; the roadmap says
  so and tells the learner to re-check.

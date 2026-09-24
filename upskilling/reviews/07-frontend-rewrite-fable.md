# Review of the uncommitted web UI rewrite (`web/src/**` + `server/app.ts`, `server/projections.ts`)

Scope: README.md, `03-frontend-opus.md`, `03-frontend-fable.md` ("FINAL RECOMMENDED CHANGES" 1–24), `git diff HEAD --stat`, every file under `web/src/` in the working tree, `server/projections.ts`, `server/app.ts`, `server/rewards.ts`, and the relevant lines of `server/gamify.ts`, `server/progress.ts`, `server/content.ts`. Exercised: `npx tsc --noEmit` (clean), `npx vite build` (751.63 kB / 249.71 kB gzip, into a scratch `outDir`), a server on `:4597` with `DATA_DIR` in my scratchpad, and a jsdom harness adapted from `scripts/ui-smoke.mjs` (esbuild IIFE of `web/src/main.tsx`, `NODE_ENV=development`, StrictMode on). The real sandbox worker does not boot on this machine with the uncommitted runner (`/run` returns `phase: 'boot'`, `ready: false`, `scored: false` after 45 s) — a server matter outside this review — so the golden path was driven against a second scratch server built with `createApp({ store, runner: stub })` on `:4598`, where the stub passes exactly when the code equals the lesson's reference solution. No repo file was modified; the only new file is this report.

## Verdict

The rewrite is substantially what the list asked for — 17 items DONE, 2 DONE DIFFERENTLY, 4 PARTIAL, 1 MISSING — and it is sized correctly: four lesson files instead of a `features/` tree, one `Modal`, one `Timeline`, one `LinkButton`, the wire types shared by `import type`, `tsc` clean, the shortcut really is a `Prec.highest` keymap that runs without inserting a line. It is not committable as it stands, for four reasons that reading alone would not have surfaced in every case. A reload on any lesson URL (or opening a bookmarked `#/lesson/...`) hangs on "Loading your progress…" forever with zero network requests: item 6 said to delete the mount effect because the route effect covered mount, and the route effect was then written to skip lesson routes. On the golden path the reward card always offers "Back to the track" and the lesson nav keeps its 🔒, because `next.unlocked` is captured at load and never refreshed after the pass — item 12's headline feature is invisible on the one occasion it matters. Every `Modal` close crashes the page under jsdom (`dialog.close is not a function`), because the jsdom fallback covers `showModal` but not `close`, which means the smoke test the fallback exists for cannot get past the first dialog. And the onboarding card that every new learner reads first promises a first-try combo that `gamify.ts` explicitly no longer has. All four are small fixes. Everything else below is genuinely minor.

## Items 1–24

| # | Item | Status | Where |
|---|------|--------|-------|
| 1 | Keyboard shortcut via `Prec.highest(keymap)`, `<kbd>` labels | DONE | `CodePane.tsx:122-123` (actions ref), `:135-140` (keymap), `:183,192,195` (kbd), `api.ts:280-281` (`isMac`/`MOD`). Verified: Ctrl+Enter fires `/run`, not `/submit`, line count unchanged. |
| 2 | Server: no combo loss / record mutation on passed lessons | DONE DIFFERENTLY | Combo removed outright (`gamify.ts:9`). `app.ts:252` gates attempts/status on `scored && !alreadyPassed`. Hint/solution routes still bump `hintsUsed`/`solutionRevealed` after a pass (`app.ts:173-179, 193-194`) but the pass snapshot is frozen (`rewards.ts:87`) and achievements read `r.pass` (`gamify.ts:292, 314`), so Flawless / No Safety Net are protected. |
| 3 | `'new'` status; autosave never marks attempted | DONE | `progress.ts:39, 340`; `app.ts:257` (only a failed submit sets `attempted`); `api.ts:8`. |
| 4 | Reset/Solution stop destroying work | DONE | Reset: `CodePane.tsx:146-150, 265-273` (Confirm, `setCode(pristine)`, `saveNow`). Solution: `:152-168` (no `setCode`; panel + "Copy into editor"), `:243-261`, `:274-290`; `publicLesson` returns `solution` once revealed (`projections.ts:233`). |
| 5 | Patch lesson state after submit and hint; `xpAtStake`; already-passed line | DONE | `CodePane.tsx:95-105`, `QuizPane.tsx:56-63`, `Lesson.tsx:101-112` (hint → `xpAtStake`), `:129-131` (pill), `CodePane.tsx:224-229` (already cleared), `projections.ts:244`. Caveat: `next`/`prev` are not patched — bug 2. |
| 6 | `/state` failure keeps last state; ticket guard; Retry; `patchProfile` | DONE | `App.tsx:47-63, 66-68, 91-110, 127-137`. Verified: a rejected `/state` on route change keeps the Stats page and shows the banner with Retry. But deleting the mount effect broke cold lesson loads — bug 1. |
| 7 | Cancel the lesson fetch on id change | DONE | `Lesson.tsx:28-48` (`ignore` flag). `onTrack` in the deps is `setLessonTrack` (stable), so no refetch loop. |
| 8 | Error boundary | DONE | `main.tsx:10-38` (verified: it is what caught bug 3). |
| 9 | Fix the vacuous smoke check | MISSING | `scripts/ui-smoke.mjs:130` still `>= 0`; the file is untouched in `git status`. |
| 10 | Reward card as `<dialog>`; reuse for confirms | DONE | `bits.tsx:233-274` (Modal), `:277-308` (Confirm), `RewardCard.tsx`, `CodePane.tsx:204-208` ("View rewards"), `Stats.tsx:120-133`. Verified: `<dialog open>` appears, focus inside, `window.confirm` never called. Caveats: bugs 3, 11, 12. |
| 11 | Quiz: clear verdict on change, sticky toolbar, fieldset/legend, inline options, "✓ Correct", classes | DONE | `QuizPane.tsx:34-46, 11/55` (stale verdict + separate score), `:84` + `styles.css:385` (sticky), `:127-131` (fieldset/legend), `:153` (InlineMarkdown), `:133-134` (verdict text), `styles.css:521-529, 545-546`. Verified all of it. Nit: bug 16 (block markdown inside `<legend>`). |
| 12 | Lock-aware Next; `prev` crossing chapters; lock page says which rule | PARTIAL | Server: `projections.ts:199-209, 247-248`; `content.ts:73-86` (`lockReason`). UI: `Lesson.tsx:190-199` (disabled Next), `:70-82` (lock page + track link), `RewardCard.tsx:17, 91-99` (fallback). Missing: the values are stale after the pass — bug 2. |
| 13 | Review mode on passed lessons | DONE | `CodePane.tsx:180-188` (Re-check → `/run`; "Submit anyway" kept). Quiz "Re-check answers" still goes to `/submit` — bug 17. |
| 14 | Accessibility pass | PARTIAL | Done: `LinkButton` (`bits.tsx:79-102`, no `<a><button>` anywhere — verified), tabs (`Achievements.tsx:38-50` — verified `button[role=tab]` in `[role=tablist]`), `role=status` (`bits.tsx:164` — verified), `aria-hidden` glyphs (`App.tsx:171,214`, `bits.tsx:138,332`, `TrackMap.tsx:98,127`, `RewardCard.tsx:79`), `document.title` (`bits.tsx:356-360`), `:focus-visible` (`styles.css:72`), reduced motion (`:74-76`), `--text-faint: #7d8794` (`:15`), attempted glyph `…` (`TrackMap.tsx:128`, `styles.css:336`). Missing: "keep Submit enabled while busy with `aria-disabled`" — bug 6. |
| 15 | Draft status + flush | DONE | `CodePane.tsx:14, 26, 38-76, 170-175, 199-201`. Verified: unsaved → saved, debounce POST, flush on unmount and on `beforeunload`. Nits: bugs 8, 9, 10. |
| 16 | Error classification; catches; 404 link back | DONE | `api.ts:220-250`, `CodePane.tsx:112-113` + `bits.tsx:175-180` (info banner), `Lesson.tsx:107-109, 180` (hint), `CodePane.tsx:158-160` (reveal), `Stats.tsx:24-26`, `Lesson.tsx:55-67`. Nit: every non-network `ApiError` (409, 403…) goes through the `unavailable` info banner too — the state name is misleading, the rendering is acceptable. |
| 17 | Persist last result per lesson; dim while busy | DONE | `CodePane.tsx:17, 21, 94`; result kept during `busy` with `styles.css:405`. |
| 18 | Responsive shell | DONE (by reading) | `styles.css:183-195` (≤760 px: `.shell` column, `.sidebar { display:none }`, `.sidebar.open`, `.menu-toggle` sticky) + `App.tsx:117-124`; `:144-145` dvh with vh fallback; `:219-221` `minmax(min(320px,100%),1fr)`; `:349-351, 356-359` 1180 px lesson breakpoint. |
| 19 | Types contract | DONE | `projections.ts:8-11`, `app.ts:7`, `rewards.ts:6` (`import type` from `web/src/api.ts`); return types on `profile`, `achievementBoard`, `trackTree`, `appState`, `publicLesson`; `HintResponse`/`RevealResponse`/`SubmitResponse` annotated in `app.ts`; `Rewards.xp: XpBreakdown | null` (`api.ts:187`). `tsc` clean. |
| 20 | Dead code; `<Timeline>` | DONE | `KIND_ICON`, `KIND_LANG`, `Progress` gone; `Timeline` with glyph map `bits.tsx:312-343`, used by Dashboard and Stats. (`Stats.tsx:11` has its own `trackById`, which is used.) |
| 21 | CSS tokens; `.muted/.faint/.stack-sm` | PARTIAL | Tokens `styles.css:3-49` incl. `--pass-border`, `--fail-border`, `--fail-text`, `--code-bg`, `--code-fg`, `--bg-hover`, `--heat-1..4`; utilities `:80-85`. Still literal: `:114 #1d232c` (that is `--bg-hover`), `:455 #86e29b`, `:462 #f0c674`, `:466/488/506 #d3dbe3`, `:632 #20272f`, `:335 #06210c`, plus ~8 `rgba()` accents. |
| 22 | Smoke test: `DATA_DIR`, hermetic server, golden-path/quiz/shortcut/draft tests, query the button | PARTIAL | `progress.ts:19` `DATA_DIR` env DONE; `scripts/e2e.ts` rewritten and hermetic (spawns its own server, `server.dataDir`) DONE for the API. `scripts/ui-smoke.mjs` is byte-for-byte the committed one: no hermetic server, none of the four tests, still `text().includes('Submit')` (`:131`) and `>= 0` (`:130`). It would also crash on the first dialog close (bug 3). |
| 23 | Sidebar context: current track on lesson routes; explicit short labels | DONE | `App.tsx:42, 145, 167, 206`, `Lesson.tsx:38`; `projections.ts:122-125, 160` + `api.ts:70`. Verified `.nav-item.active[href="#/track/js"]` on a JS lesson. |
| 24 | Split `Lesson.tsx` | DONE | `Lesson.tsx` (203 lines: view + Brief), `lesson/CodePane.tsx`, `lesson/QuizPane.tsx`, `lesson/RewardCard.tsx`. No `features/`, no `hooks/`. |

## Bugs found

Severity: **critical** = the app is unusable on a common path; **high** = a shipped feature does not work as designed; **medium** = wrong for the learner or blocks the test suite; **low** = rough edge.

1. **critical** — `App.tsx:82-87`. A cold load of `#/lesson/<id>` (reload on a lesson, bookmarked link, `npm start` then opening a lesson URL) never calls `refresh()`: the route effect skips `lesson` routes, the mount effect was removed, and `if (!state) return <Loading/>` at `:91-109` then renders forever. Verified: after 3 s, zero requests, "Loading your progress…". README's "a lesson URL survives a reload" is currently false. Fix: add `useEffect(() => { void refresh(); }, [refresh]);` and leave the route effect as the summary-screen refresher (or change the condition to `if (route.name !== 'lesson' || !state)`).

2. **high** — `CodePane.tsx:96-105`, `QuizPane.tsx:57-63`, consumed at `RewardCard.tsx:17, 91-99` and `Lesson.tsx:190-199`. `lesson.next.unlocked` / `lesson.prev` come from the initial `GET /lesson` and are never updated after a pass. On `js-once-memoize` (next locked at load), passing it produced a reward card reading "Back to JavaScript You Actually Need" and a nav still showing "🔒 Debug: the vanishing `this`", although the server now reports it unlocked. Since the reward card's Next button is the golden path's exit, item 12 is effectively invisible. Fix (server): add `next?: LessonLink; prev?: LessonLink` to `SubmitResponse` (`api.ts:197-207`) and fill them in `app.ts:263-266` from `neighbours(loc)` + `link()` in `projections.ts:199-209` (export them); then `onLesson(l => ({ ...l, next: response.next, prev: response.prev }))`. A client-only `unlocked: true` guess is wrong across chapter boundaries (the 70 % rule), so use the server.

3. **medium** — `bits.tsx:251-257`. The jsdom fallback sets the `open` attribute when `showModal` is missing, but the close branch calls `dialog.close()` unconditionally; jsdom 25.0.1 has neither (`typeof close === 'undefined'`, verified). Result: clicking "Stay here", "Cancel" on any Confirm, or Escape → `TypeError: dialog.close is not a function` inside the effect → ErrorBoundary screen. Verified in scenarios A and B. Browsers are unaffected, but this is the environment the fallback was written for and it makes any dialog test in `test:ui` impossible. Fix: `if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');` — and see bug 11 for the resulting double `onClose`.

4. **medium** — `Dashboard.tsx:28-29`: "First-try passes build a combo; hints cost a little; revealing the solution caps the reward at 20%." `gamify.ts:9`: "There is no first-try bonus and no combo". README "The game layer" still describes both (+25 % first-try, ×1.25 combo). The first card a new learner reads is wrong about the economy. Fix: "Passing without a hint pays a 20 % clean bonus; hints cost a little; revealing the solution caps the reward at 20 %." and update README.

5. **medium** — `Lesson.tsx:129-131`. `worth {xpAtStake} XP{xpAtStake !== xp ? ' of ' + xp : ''}` was written for penalties, but `xpAtStake` includes the clean bonus (`gamify.ts:116`), so a fresh 55-XP lesson reads "worth 66 XP of 55" (verified via `/lesson/js-this-binding`: `xp: 55, xpAtStake: 66`) while `TrackMap.tsx:142` shows "55 XP" for the same lesson. "of 55" reads as a cap below the offer. Fix: show `of {xp}` only when `xpAtStake < xp`, and append "(clean bonus)" when it is above; or show the same number in TrackMap.

6. **medium** — `CodePane.tsx:182, 185, 191, 194`, `QuizPane.tsx:85`. Submit/Run use `disabled={!!busy}`, so focus drops to `<body>` the moment grading starts; after a failed submit a keyboard user is nowhere (the Opus/Fable finding #11 that item 14 was written to fix). Fix: `aria-disabled={!!busy}` + the existing `if (busy) return` early return; keep real `disabled` only for the quiz's `!answered`.

7. **low** — `CodePane.tsx:80-119`. The in-flight guard is the `busy` closure value. Two invocations before React re-renders both pass `if (busy) return`: the second gets the server's 409 "Already grading this lesson", which the UI shows as an info banner, and its `finally` clears `busy` while the first grade is still running (buttons re-enable mid-grade). Verified with two synthetic keydowns in one task; in a real browser this needs a click and a keypress inside one task, so it is rare. Fix: `const inflight = useRef(false)` set/cleared synchronously inside `handle`, checked before `setBusy`.

8. **low** — `CodePane.tsx:40, 56, 57, 84`. `saveTimer.current` is cleared but never reset to `undefined`, and the timer callback does not clear it either, so `flush()` (`:64-69`) always sees a stale id and re-POSTs the draft on every unmount and every `beforeunload`, even when nothing is pending. Verified: one extra `/draft` POST after an already-saved draft. Harmless on localhost, wrong in principle. Fix: `saveTimer.current = undefined` in the timeout callback and in `saveNow`; or gate `flush` on a `dirty` ref set in `onChange` and cleared in `saveNow`/`handle`.

9. **low** — `CodePane.tsx:68`. The `beforeunload` flush is a plain `fetch` (no `keepalive`); browsers may abort it at unload. Verified `keepalive: false` on the request. Fix: give `api.saveDraft` a `{ keepalive?: boolean }` option and pass it from `flush`, or use `navigator.sendBeacon` for that path.

10. **low** — `CodePane.tsx:84, 111-116`. `handle` clears the pending debounce before the request; if the request fails (network, 409, 403) the draft status stays "Unsaved changes" and nothing re-arms the save until the next keystroke or unmount (where bug 8 accidentally rescues it). Fix: in the `catch`, `void saveNow(current)`.

11. **low** — `bits.tsx:265-269`. `onCancel` calls `preventDefault()` then `onClose()`; the state change makes the effect call `dialog.close()`, which fires the native `close` event, which calls `onClose` again. Idempotent today (both callers set a constant), fragile tomorrow. Fix: drop `onCancel` entirely — native cancel closes the dialog and fires `close`, which is already wired — or keep `onCancel` without `preventDefault` and drop `onClose={onClose}`.

12. **low** — `bits.tsx:302`, `RewardCard.tsx:100`. `autoFocus` is dead: React calls `.focus()` at commit while the `<dialog>` is still display:none (`showModal()` runs in the effect afterwards) and React does not emit the `autofocus` attribute (verified: no `[autofocus]` in the DOM), so the browser's dialog focusing steps focus the first focusable descendant — Cancel in Confirm, the Next/Back link in RewardCard. Both are acceptable defaults, so remove the props or focus explicitly after `showModal()`.

13. **low** — `QuizPane.tsx:122-124`. `verdict === 'wrong' ? outcome?.error : explanations?.[qi]?.explain` — the server never sends `error` on quiz tests (`app.ts:129-130`), so on a passed quiz re-checked with a wrong answer the explanation the learner has already earned is hidden, and the "Why not:" label at `:160` is unreachable. Fix: `explanations?.[qi]?.explain ?? (verdict === 'wrong' ? outcome?.error : undefined)`; drop "Why not".

14. **low** — `QuizPane.tsx:20-32` and `:69-71`. After a first pass, explanations are fetched twice (the direct call in `submit` plus the effect re-running when `passed` flips). Drop the direct call.

15. **low** — `QuizPane.tsx:44`. `{ ...t, passed: false, error: undefined, stale: true } as typeof t` smuggles an untyped field through `RunResult['tests']` and `:122` reads it back through another cast. Sound at runtime (verified: changing an answer clears that question's verdict, the score pill and fail banner stay), but a `useState<Set<number>>` of touched indexes says what it means. Not a bug.

16. **low** — `QuizPane.tsx:128-131`. `<legend>` contains `<Markdown>` → `<div class="md"><p>` (verified `legend > .md > p`); legend's content model is phrasing content. Fix: `<InlineMarkdown source={question.q} />`.

17. **low** — `QuizPane.tsx:86`. "Re-check answers" on a passed quiz posts to `/submit`, which increments `stats.submits` (`app.ts:249`) and can lower the "submit pass rate" on Stats; CodePane's Re-check is a consequence-free `/run`. Either label it "Submit again (no XP)" or add a run-equivalent for quizzes (`gradeQuiz` without recording).

18. **low** — `styles.css:114` vs `:674`. `button:hover:not(:disabled)` is (0,2,1); `.tab:hover { background: none }` is (0,2,0), so achievement tabs still get the raised `#1d232c` background and `border-color` on hover. Pre-existing; the rewrite added `background: none` to fix exactly this and it does not win. Fix: `.tabs .tab:hover` or `button.tab:hover:not(:disabled)`. No other regression from sharing `button`/`.btn` rules: `.btn:hover { text-decoration: none }` correctly beats `a:hover`, `.btn.disabled` is only used on the non-focusable lock span, and `a.btn` gets no `:active` transform.

19. **low** — `CodePane.tsx:156`. `reveal` ignores `RevealResponse.xpIfPassed` and recomputes `Math.round(l.xp * 0.2)`. Equal today (`gamify.ts:108-110`), silently wrong the day `SOLUTION_MULTIPLIER` changes. Use the field.

20. **low** — `SubmitResponse.scored` (`api.ts:201`) is ignored by both panes. When the sandbox fails to boot the learner sees "Could not run" plus the server's message (which does say "has not been judged"), but `status`/`attempts` are patched blindly and nothing distinguishes it from a real fail. Show the slim banner used for `alreadyPassed` when `!response.scored`.

Checked and fine: `latestCode.current = code` during render is idempotent under StrictMode's double render and `actions.current` is reassigned every render, so the keymap never calls a stale `handle`; `saveNow` and `handle` do not race in practice because `/run` and `/submit` persist the draft themselves (`app.ts:206, 232`) and `saveNow` clears the timer first; the `refresh` ticket guard behaves (a superseded refresh neither writes state nor clears `refreshing`); on a pass there is exactly one `/state` fetch from `onProgress` (the harness saw three: StrictMode's double mount effect plus that one) and `patchProfile` moves the sidebar first — verified "Tracks 1/72" and "JavaScript 1/15" updated without a reload; `Stats.reset` → `onReset` + hash change is two fetches, harmless; the sidebar collapse at 760 px and the 1180 px lesson breakpoint are correct by reading.

## Contract mismatches (`web/src/api.ts` vs `server/projections.ts` / `server/app.ts`)

Type-level: none — `tsc` passes with the server importing the UI types, and `server/runner/index.ts`'s `RunResult` (which adds `bootMs`) is structurally compatible.

Server sends, UI ignores:
- `SubmitResponse.scored` (bug 20).
- `RevealResponse.xpIfPassed` (bug 19).
- `HintResponse.exhausted` — UI derives it from `hints.length < hintCount`; fine.
- `Profile.streak.lastDay`, `LessonSummary.hintsUsed`, `LessonDetail.hintsUsed` (UI uses `hints.length`), `AppState.days[].lessons` — unused fields; harmless.
- `POST /reset` returns `{ ok, profile }`; the UI discards `profile` and refreshes. Fine.
- `GET /export` has no UI affordance (Opus "could" list).

UI needs, server lacks:
- Refreshed `next`/`prev` after a submit (bug 2) — the only real gap.
- The UI's `response.status ?? …`, `response.attempts ?? …`, `response.xpAtStake ?? …`, `if (response.profile)` fallbacks (`CodePane.tsx:95-101`, `QuizPane.tsx:56-61`) guard fields the type makes required; delete them so the type is the contract.

Copy/doc drift:
- `history` is capped at 40 entries (`projections.ts:180`) while `Stats.tsx:100` calls it "Full history".
- README "The game layer" and `Dashboard.tsx:29` describe a first-try bonus and combo that `gamify.ts` removed (bug 4); `Rewards`/`XpBreakdown` have no such fields.
- README's lesson-kind table omits `mutation`, which `api.ts:7` and `KIND_LABEL` carry.
- `app.ts` changed on disk during this review (a `RunRequest` refactor around `:35-40`); the line numbers above refer to the version read at the start, which differ by ~7 lines after `:35`.

## What to change before commit

must
1. Bug 1 — restore the mount fetch in `App.tsx` (one effect).
2. Bug 2 — `next`/`prev` in `SubmitResponse` and patch them after a submit.
3. Bug 3 + bug 11 — `Modal`: guard `close()` like `showModal()`, remove the double `onClose` path. Without this, item 22 cannot be finished.
4. Bug 4 — onboarding copy and the README game-layer section.
5. Bug 6 — `aria-disabled` while busy (item 14 asked for it explicitly).
6. Items 9 and 22 for the UI: at minimum fix `ui-smoke.mjs:130-131`; ideally the golden-path / quiz-retry / shortcut / draft tests against a hermetic server (`createApp` with a stub runner makes this ~150 lines; my scratch harness proves the approach and the assertions).

should
7. Bug 5 — the "worth X of Y" pill.
8. Bugs 7, 8, 9, 10 — all in `CodePane.tsx`, about ten lines together.
9. Bugs 13, 14, 16, 17 — `QuizPane.tsx`.
10. Bug 18 and the leftover literals from item 21 — `styles.css`.
11. Bugs 12, 19, 20 and the dead `??` fallbacks — small clean-ups.

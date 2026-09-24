# Frontend review: `web/`

Scope: `web/index.html`, `web/src/**`, `vite.config.ts`, `scripts/ui-smoke.mjs`. All files read in full. I ran `npx vite build` into a scratch directory and used esbuild's metafile to break down the bundle. I read the server only where the UI depends on how it behaves (`server/index.ts`, `server/content.ts`). No code was changed.

## Executive summary

The UI is tidy and restrained. The lesson loop (brief, editor, results, reward) is well put together. The hash router, the typed API wrapper and the CSS tokens all suit an app of this size. The problems are not in the architecture. They are in the details of the lesson page, and that page is where learners spend 95% of their time:

1. **The keyboard shortcut is wrong twice over.** In the editor, Ctrl/Cmd+Enter inserts a blank line and also submits, because CodeMirror's default keymap binds `Mod-Enter`. It is also bound to the action that scores (Submit) rather than the free one (Run), so a reflex keypress while half-done burns the first-try bonus and the combo. On a lesson you have already passed, a failing submit still resets the combo on the server.
2. **Learner code can be destroyed.** `Solution` overwrites the editor and the server-side draft. `Reset` gives no warning and is not persisted, so a reload brings the old draft back. A debounce race can also save stale code *after* a Reset or Solution.
3. **Lesson state goes stale after a submit.** The brief's status and attempts pills, the quiz's "cleared" pill, the XP at stake (the server returns it and the UI drops it) and the sidebar combo after a failure all keep showing the old values.
4. **One failed `/state` fetch replaces the whole app with an error screen.** That includes the lesson you are in and the reward card you just earned. There is no retry.
5. **Accessibility and mobile are weak.** The reward overlay is not a dialog. The Achievements tabs are `div`s. `<a><button>` nests two interactive elements. The results panel has no live region. The sidebar never collapses, so on a phone the content column is about 140px wide.

The code structure is fine for 2.5k lines, but `Lesson.tsx` has three components and four concerns in it, and every one of the bugs above lives in that file. A small hooks layer (`useAppState`, `useLesson`, `useDraft`, `useHotkey`) plus a split of the lesson feature fixes most of them structurally. The shared-types fix is cheap: a `shared/api-types.ts` that the server checks its responses against with `satisfies`.

The smoke test proves that screens render. It never clicks anything, it depends on whatever is already in the save file, and one of its assertions can never fail.

---

## Findings

### 1. Ctrl/Cmd+Enter inserts a blank line in the editor *and* submits a stale snapshot
**Severity: bug**
**Evidence:** `web/src/pages/Lesson.tsx:197-206` (window `keydown` listener) and `basicSetup` at `:243`. `@uiw/react-codemirror` includes `defaultKeymap`, which contains `{ key: "Mod-Enter", run: insertBlankLine }` (`node_modules/@codemirror/commands/dist/index.js:1806`).

**Why it matters:** CodeMirror handles the key first. It inserts a line and calls `preventDefault()`, but it does not stop propagation, so the event still bubbles up to `window` and the listener submits. That listener was registered by the previous render's effect, so `handle` closes over the `code` from before the newline. Every submit adds a blank line under the cursor, and what gets submitted is not what is on screen. The listener also ignores `event.defaultPrevented`, and it stays live while the reward overlay is open (see #10).

**Recommendation:** Bind the shortcut *inside* CodeMirror at the highest precedence. Read the latest callback through a ref. Keep a window fallback for when focus is outside the editor, and have it skip events that were already handled or that happen while a modal is open.

```tsx
// features/lesson/CodeEditor.tsx
const actions = useRef({ run: () => {}, submit: () => {} });
actions.current = { run: () => onRun(), submit: () => onSubmit() };

const keys = useMemo(() => Prec.highest(keymap.of([
  { key: 'Mod-Enter',       run: () => (actions.current.run(), true) },
  { key: 'Mod-Shift-Enter', run: () => (actions.current.submit(), true) },
])), []);
// extensions={[lang, keys]}
```

### 2. The muscle-memory shortcut scores. It should run.
**Severity: ux (high)**
**Evidence:** `Lesson.tsx:199-201` sends Mod+Enter to `handle('submit')`. `:219` labels Submit with `⌘↵`. `server/index.ts:356` increments `attempts` on every failed submit (which kills `firstTry`), and `server/index.ts:361-362` sets `p.combo = 0` on *any* failed submit, including when `alreadyPassed`.

**Why it matters:** The README sells "Run vs Submit — Run grades without consequences." The one shortcut every developer presses without thinking is wired to the consequential action. A learner who presses Ctrl+Enter to check progress loses the +25% first-try bonus and the combo. When they revisit a passed lesson to experiment, a single Ctrl+Enter on broken code silently wipes the combo they built elsewhere. The `⌘↵` glyph is also wrong on Windows and Linux.

**Recommendation:** Make `Mod-Enter` Run and `Mod-Shift-Enter` Submit, and show a platform-correct label (`navigator.platform.includes('Mac') ? '⌘↵' : 'Ctrl+↵'`). On a passed lesson, relabel Submit as "Re-check (no XP)" and send it to `/run`. Separately, the server should not reset the combo on an `alreadyPassed` failure (a one-line server fix, outside this scope).

### 3. "Solution" overwrites the learner's code, on screen and on the server
**Severity: bug**
**Evidence:** `Lesson.tsx:208-213` runs `setCode(solution)` and then `api.saveDraft(lesson.id, solution)`. `server/content.ts:107` sends `solution` to the client once it has been revealed, but nothing in the UI reads `lesson.solution`.

**Why it matters:** The moment a learner most needs to compare their attempt with the reference is the moment the attempt gets deleted. Once they navigate away, the pre-reveal draft is gone for good. After a reload, the revealed solution is only visible if it happens to be the current draft. The `confirm()` text talks about XP but does not mention that their code will be replaced.

**Recommendation:** Show the solution in a read-only pane, or better a side-by-side diff, and leave the learner's code alone. Add a "Copy into editor" button that is explicit and undoable. Render `lesson.solution` whenever it is present, so a revealed solution survives a reload. `@codemirror/merge` (about 30KB) does this and belongs in the lazily loaded lesson chunk (#16).

### 4. Reset gives no warning, is not persisted, and races with the draft debounce
**Severity: bug**
**Evidence:** `Lesson.tsx:226` runs `onClick={() => setCode(lesson.pristineStarter)}`. `@uiw/react-codemirror` applies prop-driven changes with an `ExternalChange` annotation and does **not** call `onChange` for them (`useCodeMirror.js:86`), so no draft save happens. The debounce timer at `Lesson.tsx:158-161` is never cancelled or flushed.

**Why it matters:**
- Reset discards work with one click and no confirmation. It can be undone with Ctrl+Z in the editor, but nothing tells the learner that.
- Reset is not durable. Reload or navigate away before typing, and the server's old draft comes back. The button does two opposite things depending on what you do next.
- Race: type something, then press Reset (or Solution) within 800ms. The pending timer fires afterwards and writes the *pre-reset* code to the server, so a reload shows code the learner thought they had thrown away.
- If a draft save fails, the error is swallowed (`.catch(() => {})`). A learner with the API down believes their work is saved.

**Recommendation:** Add a `useDraft` hook that owns the debounce, exposes `setNow(value)` (cancels the pending timer and saves immediately), `flush()` on unmount and on `beforeunload`, and a `status: 'saved' | 'saving' | 'unsaved' | 'error'` shown in the toolbar. Reset asks for confirmation (see #13) and then calls `setNow(pristine)`.

```ts
export function useDraft(id: string, initial: string) {
  const [code, setCode] = useState(initial);
  const [status, setStatus] = useState<'saved'|'saving'|'unsaved'|'error'>('saved');
  const timer = useRef<number>(); const latest = useRef(initial);
  const save = useCallback(async (v: string) => {
    window.clearTimeout(timer.current); setStatus('saving');
    try { await api.saveDraft(id, v); if (latest.current === v) setStatus('saved'); }
    catch { setStatus('error'); }
  }, [id]);
  const edit = (v: string) => { latest.current = v; setCode(v); setStatus('unsaved');
    window.clearTimeout(timer.current); timer.current = window.setTimeout(() => save(v), 800); };
  const setNow = (v: string) => { latest.current = v; setCode(v); void save(v); };
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); void api.saveDraft(id, latest.current); } }, [id]);
  return { code, edit, setNow, status, latest };
}
```

Components read `latest.current` (not a closed-over `code`) when submitting, which also removes the stale-closure half of #1.

### 5. Lesson and sidebar state go stale after a submit or hint
**Severity: bug**
**Evidence:**
- `Lesson.tsx:72-77`: the brief's status pill and attempts pill come from `lesson`, which is fetched once (`:14-18`) and never updated after a submit.
- `Lesson.tsx:315`: the quiz's "cleared" pill reads `lesson.status`, so it **never appears after you pass a quiz** until you navigate away.
- `Lesson.tsx:174-180`: `response.attempts`, `response.xpAtStake` and `response.profile` are ignored. `onProgress()` is only called when `rewards` is non-null.
- `Lesson.tsx:53`: the hint response's `xpAtStake` is ignored.

**Why it matters:**
- After a pass, the header still says "150 XP" next to the toolbar's "cleared".
- After three failures, the header still says "1 attempt".
- After a failed submit, the server has zeroed the combo but the sidebar still shows "×3 combo". The learner finds out only on the next pass.
- The server computes "what a pass is worth now", and README.md says it is returned "so the cost of hints is visible". The UI throws it away.

**Recommendation:** `useLesson` exposes `applySubmit(response)` and `applyHint(response)`, which patch `status`, `attempts`, `xpAwarded` and `xpAtStake` locally. After *every* submit and hint, call `onProgress()`, or better, push `response.profile` straight into app state (`setProfile`) so no second request is needed. Show "Worth now: 106 XP" next to Submit.

### 6. Any `/state` failure unmounts the whole app, including the lesson you are in
**Severity: bug**
**Evidence:** `App.tsx:45-52` sets `error` on a failed refresh. `App.tsx:64-74` renders only the error screen whenever `error` is set. Refresh runs on every non-lesson route change (`:60-62`) and through `onProgress` after a pass (`Lesson.tsx:177`).

**Why it matters:** If the API hiccups right after a pass (for example, a `tsx watch` restart in dev), `onProgress → refresh` fails and the error screen replaces the shell. The lesson, the reward card and the result panel are all unmounted. The server did record the pass, but the learner never sees the reward. The error screen has no retry button and no sidebar. It only clears after a hash change to a non-lesson route that happens to succeed.

**Recommendation:** Separate *initial* load failure (full-screen, with a Retry button) from *refresh* failure (keep the last good `state` and show a dismissable banner with Retry). This belongs in `useAppState`:

```ts
export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try { const s = await api.state(); if (mine === seq.current) { setState(s); setError(null); } }
    catch (e) { if (mine === seq.current) setError(String((e as Error).message ?? e)); }
  }, []);
  const patchProfile = (profile: Profile) => setState((s) => s && { ...s, profile });
  useEffect(() => { void refresh(); }, [refresh]);
  return { state, error, refresh, patchProfile, fatal: !state && !!error };
}
```

### 7. Fetch races and duplicate requests
**Severity: bug (low)**
**Evidence:**
- `Lesson.tsx:14-18`: `api.lesson(id).then(setLesson)` has no cancellation. Go to lesson A and then quickly to B, and if A's response arrives last, A renders under B's URL. Its `CodePane` is keyed by A's id, so draft saves go to **A** while the address bar says B.
- `App.tsx:54-62`: both effects fire on mount, so there are two `/state` requests (four under StrictMode in dev). `GET /state` also writes the save file (`server/index.ts:265`).
- Refresh has no ordering guard, so an older response can overwrite a newer one.

**Recommendation:** Use an `ignore` flag or `AbortController` in `useLesson`, and the sequence guard shown in #6. Delete the first effect in `App.tsx` (`:54-56`): the route effect already covers mount.

### 8. The Next and Previous buttons ignore locks, and the lock message is wrong
**Severity: ux**
**Evidence:**
- `Lesson.tsx:119-132` and `:504-510`: Next always links to `lesson.next`.
- `server/content.ts:116-118`: `next` crosses into the next chapter, which may still be behind the 70% gate, while `prev` does not cross chapters.
- `Lesson.tsx:22-30`: the locked screen always says "Finish the previous lesson in <chapter>".

**Why it matters:**
- Pressing Next on an unfinished lesson, which is always locked within a chapter, lands on a dead-end "Locked" page.
- After a pass that ends a chapter, the reward card's "Next lesson →" can land on a locked chapter with a message that gives the wrong reason.
- Previous vanishes on the first lesson of chapter 2 even though Next crossed into it.

**Recommendation:** Have the server send `next: { id, unlocked, reason? }` and `prev` that crosses chapters. Otherwise the client can work it out from `state.tracks`, which it already has. Disable Next with a tooltip ("Unlocks when you pass this"), and in the reward card fall back to "Back to the track" or `state.nextUp`. The locked page should say which rule applies ("Chapter opens at 70% of <previous chapter>: 5/9 done") and link to `nextUp`.

### 9. The quiz UI: stale verdicts, give-away explanations, a toolbar that scrolls away
**Severity: ux**
**Evidence:** `Lesson.tsx:262-389`.
- **Answers can be changed after a wrong submit** (the inputs stay enabled). But the verdict stays attached: the `.wrong` border, "Not quite. <explanation>" (`:375-379`) and the "3 of 5 correct" banner (`:319-332`) all remain after the learner edits that question. The page then shows a verdict about an answer that is no longer selected.
- **It does show which questions were wrong**, with a red border and the text "Not quite.". Correct questions only get a green border, which is colour-only (`styles.css:442`). Individual options are only marked correct or incorrect after a pass (`:354-361`, and those colours are inline hex literals).
- The server returns the full `explain` for every wrong question (`server/index.ts:393`). In practice that states the answer, so the second submit costs nothing to get right and the quiz stops testing anything. This is a design call, but it undercuts the "reading the brief pays better than guessing" economy.
- Scrolling: `.work-pane` gets an inline `overflowY: auto` (`:308`) and the inner div also sets `overflowY: auto` (`:318`), which does nothing because it has no height limit. The whole pane scrolls, **including the toolbar with the Submit button**. After question 5 the learner has to scroll back to the top to submit.
- The quiz has no Ctrl+Enter, while the code pane does.
- The options are not grouped: there is no `fieldset`/`legend` or `role="radiogroup"` with `aria-labelledby`, so a screen reader announces options without their question. Markdown `<div>`/`<p>` inside a `<label>` is invalid content.
- Nit: `multi = answer.length > 1` (`server/content.ts:108`) means "Select all that apply" tells the learner there are at least two correct answers.

**Recommendation:** Clear `result.tests[qi]` when question `qi` changes. Put a sticky footer bar with "Submit answers" and an "n/5 answered" count at the bottom. Mark correct questions with "✓ Correct" text. Wrap each question in `<fieldset><legend>`. Server-side, consider returning only `{passed}` on the first wrong attempt and the explanation from the second attempt onward (or after a pass).

### 10. The reward overlay is not a dialog
**Severity: ux / a11y**
**Evidence:** `Lesson.tsx:406-407`: a `div.overlay` with `onClick={onClose}`, and no `role="dialog"`, `aria-modal`, `aria-labelledby`, initial focus, focus trap, Escape handling or focus restore. `:505-516`: `<a><button>` is used for the primary action.

**Why it matters:**
- Keyboard users stay focused on the (now disabled) Submit button behind the overlay.
- Tab moves through the page underneath.
- Escape does nothing.
- One stray click on the backdrop dismisses the XP breakdown for good; the rewards cannot be seen again.
- Ctrl+Enter while the overlay is open resubmits (#1).

**Recommendation:** Add one `Modal` component built on the native `<dialog>` element with `showModal()`. That gives focus trapping, Escape handling and inert background from the browser, and it can be reused for confirms (#13). Autofocus "Next lesson". Do not close on backdrop click for the reward card. Keep the last `rewards` on the lesson so a "View rewards" pill can reopen it.

```tsx
export function Modal({ open, onClose, labelledBy, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; open ? d.showModal() : d.close(); }, [open]);
  return <dialog ref={ref} className="modal" aria-labelledby={labelledBy}
                 onClose={onClose} onCancel={onClose}>{children}</dialog>;
}
```

### 11. Accessibility sweep
**Severity: ux / a11y**
- **Nested interactive elements:** `<a><button>` at `Lesson.tsx:121-130`, `:505-516` and `Dashboard.tsx:76-78`. Each is two tab stops and invalid HTML. Use `<a className="btn primary">` and style anchors as buttons.
- **The Achievements tabs are `div`s with `onClick`** (`Achievements.tsx:33-39`). They cannot be focused or used from the keyboard. Use `<button role="tab" aria-selected>` inside `role="tablist"`.
- **The results panel has no live region** (`bits.tsx:108-180`). A screen reader user hears nothing after Run or Submit. Put `role="status" aria-live="polite"` on a visually concise summary ("3 of 5 passing").
- **Focus is lost on submit.** The focused Submit button becomes `disabled`, which drops focus to `<body>`. Keep it enabled and ignore clicks while busy (`aria-disabled`), or move focus to the results summary when grading finishes.
- **Colour-only status:**
  - The "attempted" lesson marker is an empty circle with a yellow border (`TrackMap.tsx:122-124`, `styles.css:270`).
  - Correct quiz questions (#9) are marked only by colour.
  - The heatmap relies on colour plus a `title` attribute.

  Add a glyph or visually hidden text for each.
- **Glyph icons are read aloud** (◆ ⬢ ★ ▤ ☠ 🐘). Add `aria-hidden` on `.nav-icon`, `.test-icon`, markers and badges.
- **Route changes** do not move focus or update `document.title`. Add `useEffect(() => { document.title = \`${lesson.title} · bootlocalopus\` })` and focus the `h1` (`tabIndex={-1}`) on navigation. This also makes browser history and tabs readable.
- **Styles:** no `:focus-visible` style anywhere in `styles.css`, and no `prefers-reduced-motion` handling for the `pop`, `fade` and bar/ring transitions.

### 12. Mobile layout and the lesson-layout height
**Severity: ux**
**Evidence:**
- `styles.css:79-92`: the sidebar is a fixed 232px and sticky at `100vh`, and there is **no** media query for it.
- `:148`: `.grid.cols-2` uses `minmax(320px, 1fr)`.
- `:277-285`: `height: calc(100vh - 0px)`.
- `:294`: `.work-pane { height: 78vh }` below 940px.

**Why it matters:**
- On a 390px phone the main column is 158px wide, minus 68px of `.page` padding. Every `cols-2` grid (minimum 320px) overflows sideways.
- `calc(100vh - 0px)` is a no-op left over from an earlier idea. `100vh` on mobile Safari and Chrome includes the collapsing URL bar, so the editor's bottom (the results panel) sits under the browser chrome.
- Below 940px the brief stacks *above* the editor, so the learner scrolls past the whole brief to reach the code, and back up to re-read it.
- Just above 940px, the sidebar leaves 709px for a `minmax(340px, 42%)` brief and the editor. That is cramped.

**Recommendation:**
- Below about 760px, turn the sidebar into a top bar (brand, a hamburger that opens the nav as a sheet, Lv and streak pills).
- Use `height: 100dvh` with `100vh` as a fallback. Change `minmax(320px, 1fr)` to `minmax(min(320px, 100%), 1fr)`.
- On narrow lesson screens, use a two-tab switch (Brief | Code) rather than stacking.
- Base the lesson breakpoint on the width of the main column, not the viewport. Either raise it to about 1180px, or collapse the sidebar on the lesson route. A container query on `.main` does this cleanly.

### 13. Error handling gaps and `window.confirm`/`prompt`
**Severity: ux**
**Evidence:** `revealHint` (`Lesson.tsx:50-58`), `reveal` (`:208-213`) and `Stats.reset` (`Stats.tsx:16-27`) use `try/finally` without `catch` (or have no try at all), so failures become unhandled rejections and the button quietly re-enables. When the API is down mid-submit, the learner sees "Could not run / Failed to fetch" (`bits.tsx:153-161`), which reads like their code failed.

**Recommendation:**
- Classify errors in `request()`: a `TypeError` from fetch becomes `ApiUnavailable` with the copy "The local server is not responding. Your code is still here; start it with `npm run dev` and press Run again." Show that as `info`, not `fail`.
- Add a small toast or inline error to hint, solution and reset.
- `window.confirm` and `prompt` are acceptable for a local tool, but they cannot say "your code will be replaced" with any emphasis, and `prompt` for RESET is clumsy. Once `Modal` exists (#10), a `ConfirmDialog` with a typed-confirmation variant takes about 40 lines. Low priority on its own.

### 14. Results are ephemeral
**Severity: ux**
**Evidence:** `Lesson.tsx:169` (`setResult(null)` before each run), and `result` lives in `CodePane` state.

**Why it matters:** Navigate to the brief of another lesson and back, and your last failure list is gone. You cannot see the previous run while the new one grades. Comparing "before and after my change" is exactly what a learner wants.

**Recommendation:** Keep the previous result visible (dimmed) while `busy`. Cache the last result per lesson in a module-level `Map` (per session), or in `sessionStorage` (survives reload). The server already stores `lastRunMs` and could store `lastResult` too.

### 15. Dead code and duplication
**Severity: nit**
- `KIND_ICON` (`bits.tsx:184-192`) and `KIND_LANG` (`api.ts:221-229`) are never imported. `CodePane` re-derives the language inline (`Lesson.tsx:147-152`).
- `trackById` in `Dashboard.tsx:6` is unused.
- `App.tsx:165-171` `Progress` duplicates `Bar`.
- The history timeline is implemented twice (`Dashboard.tsx:140-175` with a 5-deep nested ternary, and `Stats.tsx:105-121`). Extract `<Timeline entries limit />` with a `KIND_GLYPH` map.
- `.reward-line:last-of-type` (`styles.css:507`) matches by element type, not class, so it only works by accident.

### 16. Bundle: one 740KB chunk (246KB gzip)
**Severity: design (perf)**
**Evidence:** `vite build` produces `index-*.js` at 740.6KB, with the >500KB warning. Measured with esbuild's metafile (minified bytes):

| Package | KB |
| --- | --- |
| @codemirror/view | 190 |
| react-dom | 127 |
| @lezer/javascript | 76 |
| @codemirror/state | 46 |
| marked | 35 |
| @codemirror/autocomplete | 34 |
| @codemirror/lang-sql | 31 |
| @lezer/lr | 26 |
| @codemirror/language | 25 |
| @codemirror/commands | 23 |
| @lezer/common | 21 |
| @codemirror/search | 20 |
| @codemirror/lint | 11 |
| app code | 36 |

CodeMirror plus Lezer is about 500KB of it. `marked` is in the main chunk only because `bits.tsx` imports it at module level and the Dashboard imports `bits`.

**Why it matters (honestly):** The app is served from localhost, so transfer is close to free. The cost is parse and compile time, perhaps 50–100ms on a mid-range laptop, before the dashboard paints. That is worth fixing because the fix is tiny, not because it hurts much today.

**Recommendation:**
- `const LessonView = lazy(() => import('./pages/Lesson.tsx'))` inside `<Suspense fallback={<div className="loading">Loading lesson…</div>}>`.
- Move `Markdown` to its own module so `marked` follows the lesson chunk.
- Optionally load `lang-sql` and `lang-javascript` per kind with `import()`.
- `basicSetup` brings in autocomplete, search and lint (about 65KB). Autocomplete of in-document words is of little use to a learner and occasionally gets in the way. Consider `basicSetup={{ autocompletion: false, ... }}`.

Expected result: a main chunk of about 170KB (55KB gzip) and a lesson chunk of about 560KB.

---

## Code structure

`bits.tsx` mixes markdown rendering, gauges, quests, test results, a constant and a date formatter. `Lesson.tsx` holds four components and owns fetching, drafts, hotkeys, grading, quiz state and rewards. The tangle is the direct cause of #1, #4, #5 and #7. The fix is a split by feature plus four hooks. No new dependencies are needed.

```
shared/
  api-types.ts          AppState, Profile, LessonDetail, RunResult, Rewards, SubmitResponse …
web/src/
  main.tsx
  app/
    App.tsx             shell + route switch (lazy Lesson)
    router.ts           Route, parseHash, useRoute(), go()
    Sidebar.tsx
  api/
    client.ts           request(), ApiError / ApiUnavailable
    index.ts            api.* endpoints, re-exports types from shared/
  hooks/
    useAppState.ts      state, refresh (seq-guarded), patchProfile, error vs fatal
    useLesson.ts        fetch with abort, applySubmit/applyHint patches
    useDraft.ts         debounce + flush + setNow + status   (#4)
    useHotkey.ts        window hotkeys that respect defaultPrevented / open dialogs
  components/
    Markdown.tsx  Bar.tsx  LevelRing.tsx  Stat.tsx  QuestList.tsx  Timeline.tsx
    Modal.tsx  ConfirmDialog.tsx  Pill.tsx(optional)
  features/lesson/
    LessonPage.tsx      locked/loading/error + layout (lazy entry point)
    Brief.tsx  Hints.tsx
    CodePane.tsx        toolbar + editor + results; uses useDraft
    CodeEditor.tsx      CodeMirror wrapper, language per kind, keymap (#1)
    SolutionView.tsx    read-only / merge view (#3)
    ResultPanel.tsx  TestList.tsx
    QuizPane.tsx  QuizQuestion.tsx
    RewardCard.tsx      inside <Modal>
  pages/
    Dashboard.tsx  TrackMap.tsx  Achievements.tsx  Stats.tsx
  lib/
    format.ts (relativeTime)   kinds.ts (KIND_LABEL, KIND_LANG, KIND_GLYPH)
  styles/ (see below)
```

**Pass data down or use context?** With four pages and one shell, keep passing props. Pass `state` plus `refresh` and `patchProfile` down. An `AppStateContext` only earns its place if the command palette (feature table) needs state from outside the page tree, and then it is roughly 10 lines.

**Sharing API types with the server:** `api.ts:1` says "Shapes mirror server/index.ts", and it is kept in sync by hand. The runner already exports `RunResult` and `TestResult` (`server/runner/index.ts:39-46`), and `Rewards` is a private interface in `server/index.ts:159`. Proposal:

1. Create `shared/api-types.ts` holding the response interfaces: move `RunResult`, `TestResult`, `Rewards`, and write `AppState`, `Profile` and `LessonDetail`.
2. On the server, annotate each projection: `function profile(p): Profile`, `publicLesson(...): LessonDetail`, and `res.json({ ... } satisfies AppState)`. Any drift is now a `tsc` error on the server side, where the drift starts.
3. In `web/src/api/index.ts`, write `export type * from '../../../shared/api-types.ts'`. It is type-only, so Vite erases it and no server code reaches the bundle. `tsconfig.json` already includes both trees, so `npm run typecheck` covers the contract.

The alternative, `export type AppState = ReturnType<typeof buildState>` imported from `server/`, needs less code. But it makes the UI's contract whatever the server happens to return, and it pulls server modules into the web type graph. Prefer the explicit shared file.

## Styling

At 592 lines of global CSS for about 2.5k lines of TSX, one stylesheet is **fine**. CSS modules would add ceremony without fixing the real problems. Those problems are:

1. **96 inline `style={{}}` objects** (Dashboard 23, Lesson 25, Stats 17, TrackMap 13, App 10). Many repeat the same values: `color: 'var(--text-dim)', fontSize: 13`, `marginTop: 14`, the track badge tint. They cannot be themed, cannot respond to media queries, and hide the design in the JSX. Replace them with a dozen utility and component classes (`.muted`, `.faint`, `.stack-sm`, `.btn-danger`, `.track-badge--lg`), and set the track colour through a CSS variable: `style={{ '--track': track.color }}` plus `.track-badge { background: color-mix(in srgb, var(--track) 13%, transparent); color: var(--track) }`.
2. **About 40 hard-coded hex values outside `:root`** (`#1f6f2c`, `#7a2620`, `#ffb4ae`, `#1c232c`, `#ffd88a`, `#222a35`, `#1a2029`, heatmap greens…), plus more inline in TSX (`Lesson.tsx:357`, `Stats.tsx:132`). These are the only thing stopping a light theme. Promote them to semantic tokens: `--pass-border`, `--fail-border`, `--fail-text`, `--code-bg`, `--code-fg`, `--track-bg`, `--hover-bg`, `--heat-1..4`.
3. **Split the file into imported partials, not modules.** `styles/tokens.css` (with a `[data-theme="light"]` block later), `base.css` (reset, buttons, typography, focus-visible, reduced-motion), `layout.css` (shell, sidebar, grids, responsive), plus one file per feature (`lesson.css`, `quiz.css`, `reward.css`, `markdown.css`) imported from that feature's entry component. Vite orders them correctly, and the lesson CSS then rides along with the lazily loaded lesson chunk.

## `scripts/ui-smoke.mjs`: what it misses

What it does well: it builds the real bundle and mounts it against the real API. The stale-route guard in `navigate()` is also careful.

Gaps:

1. **It never interacts.** There is no typing, Run, Submit, reward card, hint reveal, quiz answer, Reset, Solution or keyboard shortcut. Every bug in #1–#9 would pass.
2. **It is not hermetic.** It asserts `cleared lessons are marked > 0` (`:119`), `at least one earned badge` (`:158`) and `explanations for a passed quiz` (`:151-152`). Those hold only if `test:api` has already populated `data/progress.json`, so on a fresh clone the UI test fails. `DATA_DIR` is hard-coded (`server/progress.ts:12`), so the script cannot run against a scratch save without clobbering the real one.
3. **One check can never fail:** `all('.md table').length >= 0` (`:130`).
4. **Weak checks:** `text().includes('Submit')` should query the button itself. `/90 XP/` is tied to one lesson's content.
5. **The error filter is broad.** `/stylesheet/i` and similar patterns (`:177-179`) could hide a real error whose message mentions a stylesheet.
6. **Screens and states never exercised:**
   - the API-down error screen
   - the locked-lesson screen
   - an unknown lesson id (404)
   - an unknown hash route
   - the Achievements tabs actually filtering

Recommended additions, in order:

1. Make the server take `DATA_DIR` and `PORT` from env. The smoke test then spawns its own server against a temp directory, so it is hermetic and can mutate progress freely.
2. Add a golden-path test through the UI:
   - stub `window.confirm = () => true`
   - open `#/lesson/js-<first>` and click Solution
   - wait for the editor text to change, then click Submit
   - wait for `.reward` and assert `+` XP and "Next lesson"
   - click Stay here and assert the sidebar count went from `0/72` to `1/72` and the brief shows "cleared" (this catches #5)
3. Quiz: pick option 0 everywhere and submit. Assert the fail banner, at least one `.quiz-q.wrong`, and that inputs are still enabled. Change one answer and assert its verdict clears (catches #9).
4. Shortcut: focus `.cm-content`, dispatch `keydown` Ctrl+Enter, and assert the document's line count did not change (catches #1).
5. Draft: type via `document.execCommand('insertText')` into `.cm-content`, or dispatch through the `EditorView` exposed under a `data-testid` hook. Wait 1s, re-navigate, and assert the text persisted. Then Reset, reload, and assert the starter comes back (catches #4).
6. A fetch-stub mode (no server) that serves fixture JSON. It covers the reward card with a level-up, achievements and quests, the API-down screen, and the refresh-failure banner (#6) deterministically.

---

## Feature proposals

Ranked by value divided by effort. Effort: S is under 2h, M is half a day, L is more than a day.

| # | Feature | Value | Effort | Recommendation |
|---|---|---|---|---|
| 1 | **Saved/unsaved indicator + durable Reset** (`useDraft`) | High: trust in not losing work | S | Do now (it is #4) |
| 2 | **Live "worth now: N XP"** next to Submit, from `xpAtStake` | High: makes the hint and attempt economy visible, which the README already promises | S | Do now; the data is already returned |
| 3 | **Solution as a side-by-side diff**, not an overwrite; also "diff vs starter" | High: this is where the learning happens | M (`@codemirror/merge`, lazy) | Do; the same component gives the starter-vs-current diff for free |
| 4 | **Lock-aware Next and a per-track flow**: disabled Next with a reason; the reward card falls back to `nextUp`; "Continue track" on the track page | High: removes dead ends | S | Do |
| 5 | **Test names shown before running** (the spec is visible) | High for `js`/`react`/`node`; the brief sometimes underspecifies | M: the server needs a "list" mode in the harness that collects `describe`/`it` names without running bodies | Do. As an interim, the ResultPanel's empty state could say "Press Run on the starter to see the test list" |
| 6 | **First-run onboarding card** on the Dashboard when `lessonsPassed === 0 && submits === 0`: Run vs Submit, hint cost, shortcuts, the 70% rule | Med-high | S | Do; dismiss with `localStorage` |
| 7 | **Persist the last result per lesson** (session `Map` or server `lastResult`) | Medium | S | Do |
| 8 | **Review mode for passed lessons**: Submit becomes "Re-check (no XP)" going to `/run`; show your passing code vs the reference; the quiz shows answers read-only | Medium; also protects the combo (#2) | S–M | Do after #3 |
| 9 | **Command palette / lesson search** (Ctrl+K) over `state.tracks`: fuzzy match on title, tags and kind; shows locked and passed state | Medium: 72 lessons across 6 tracks is past the point of scanning | M (about 150 lines incl. keyboard nav, uses `Modal`) | Do after the Modal exists |
| 10 | **Lazy-load CodeMirror and marked** | Low-med (localhost) | S (about 10 lines) | Do; cheap, and it removes the build warning |
| 11 | **Editor settings**: font size, word wrap, and optional vim (`@replit/codemirror-vim`, lazy) in `localStorage` | Low-med | S for font and wrap, M for vim | Font size and wrap yes; vim only if asked |
| 12 | **Mobile Brief/Code tabs + collapsible sidebar** | Medium (tablet and laptop split-screen matter more than phones) | M | Do alongside #12 |
| 13 | **Light theme** | Low-med | M; mostly the token cleanup in Styling | Do the tokens now, the theme later |
| 14 | **Export progress**: "Download progress.json" plus a printable one-page skills summary (`@media print`) | Low | S | Nice-to-have |
| 15 | **Better empty states** (Achievements "Earned" tab with none earned, Stats with no history) pointing to `nextUp` | Low | S | Fold into the other work |

---

## Proposed refactor plan

Ordered so that each step ships on its own and the early steps fix the bugs.

1. **Shared types.** Create `shared/api-types.ts`. The server annotates `profile()`, `publicLesson()` and the `/state`, `/submit` and `/run` responses with `satisfies`. `web/src/api` re-exports the types. Split `api.ts` into `client.ts` (with `ApiUnavailable` classification) and `index.ts`. Delete `KIND_LANG` and `KIND_ICON`, or move them to `lib/kinds.ts` if they get used.
2. **`useAppState`** with a sequence-guarded refresh, `patchProfile`, and the split between fatal errors and a non-fatal banner (#6, #7). Remove the duplicate mount effect.
3. **Split the lesson feature** into `features/lesson/*` with no behaviour change. Add `useLesson` (abortable fetch, `applySubmit`, `applyHint`) and wire it in, so the stale-state bugs go away (#5, #7).
4. **`useDraft`** plus the toolbar save status, a durable confirmed Reset, and flush on unmount (#4).
5. **`CodeEditor`** with the CodeMirror keymap: `Mod-Enter` runs and `Mod-Shift-Enter` submits, with platform labels, and the window fallback moves to `useHotkey` (#1, #2). Add the one-line server change so an `alreadyPassed` failure does not reset the combo.
6. **`Modal`** on `<dialog>`, then `RewardCard` inside it and `ConfirmDialog` replacing `confirm`/`prompt` (#10, #13).
7. **`SolutionView`** with a read-only or merge view. Stop overwriting code, and render `lesson.solution` after a reload (#3).
8. **Quiz fixes:** fieldset/legend, per-question verdicts that clear on change, a sticky submit footer, "✓ Correct" text (#9). Lock-aware Next and Previous, and an accurate locked-screen message (#8).
9. **Accessibility pass:** anchors styled as buttons in place of `<a><button>`, real tab buttons, a live region on results, `aria-hidden` on glyphs, `document.title` and focus per route, `:focus-visible`, and `prefers-reduced-motion` (#11).
10. **CSS:** split into tokens, base, layout and feature partials. Promote hex values to tokens. Replace inline styles with classes. Add the responsive sidebar, `100dvh`, and `minmax(min(320px,100%),1fr)` (#12).
11. **Code-split** `LessonPage` and `Markdown` with `React.lazy`, and turn off autocompletion in `basicSetup` (#16).
12. **Smoke test:** `DATA_DIR` and `PORT` from env, a hermetic server, the golden-path Submit to reward card test, the quiz retry test, the shortcut test, the draft persistence test, and a fetch-stub mode for error states. Delete the check that can never fail.
13. **Features** in table order: worth-now XP, onboarding, persisted results, review mode, test-name listing, command palette.

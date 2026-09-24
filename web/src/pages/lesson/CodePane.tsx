import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';

import { api, ApiUnavailable, MOD, type RunResult, type Rewards, type SubmitResponse } from '../../api.ts';
import { Confirm, ResultPanel } from '../../components/bits.tsx';
import type { LessonPaneProps } from '../Lesson.tsx';
import { RewardCard } from './RewardCard.tsx';

type DraftState = 'saved' | 'saving' | 'unsaved' | 'error';

/** A slim note under the toolbar about how the last submit was counted. */
type Note = 'alreadyPassed' | 'unscored' | null;

/** Last result per lesson, so navigating away and back does not lose it. */
const lastResults = new Map<string, RunResult>();

export function CodePane({ lesson, onLesson, onProgress, onProfile }: LessonPaneProps) {
  const [code, setCode] = useState(lesson.starter);
  const [result, setResult] = useState<RunResult | null>(() => lastResults.get(lesson.id) ?? null);
  const [busy, setBusy] = useState<'run' | 'submit' | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [showRewards, setShowRewards] = useState(false);
  const [draft, setDraft] = useState<DraftState>('saved');
  const [confirm, setConfirm] = useState<'reset' | 'solution' | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const passed = lesson.status === 'passed';
  const saveTimer = useRef<number | undefined>(undefined);
  /** The editor holds changes the server has not been sent yet. */
  const dirty = useRef(false);
  /** Synchronous in-flight guard: `busy` is a render-time value and lags a double trigger. */
  const inflight = useRef(false);
  const latestCode = useRef(code);
  latestCode.current = code;

  /* -------------------------------------------------------------- drafts */

  const cancelTimer = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
  };

  const saveNow = useCallback(
    async (value: string) => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      dirty.current = false;
      setDraft('saving');
      try {
        await api.saveDraft(lesson.id, value);
        setDraft('saved');
      } catch {
        dirty.current = true;
        setDraft('error');
      }
    },
    [lesson.id],
  );

  const onChange = useCallback(
    (value: string) => {
      setCode(value);
      setDraft('unsaved');
      dirty.current = true;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = undefined;
        void saveNow(value);
      }, 800);
    },
    [saveNow],
  );

  // Flush unsaved changes on unmount and on tab close, instead of losing them.
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      if (!dirty.current) return;
      dirty.current = false;
      void api.saveDraft(lesson.id, latestCode.current, { keepalive: true }).catch(() => {});
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [lesson.id]);

  /* --------------------------------------------------------- run / submit */

  const handle = useCallback(
    async (mode: 'run' | 'submit') => {
      if (inflight.current) return;
      inflight.current = true;
      // Submit must grade what is on screen, not what the last debounce saved;
      // /run and /submit persist the draft themselves.
      cancelTimer();
      const current = latestCode.current;
      const wasDirty = dirty.current;
      dirty.current = false;
      setBusy(mode);
      setUnavailable(null);
      setNote(null);
      try {
        const response: SubmitResponse =
          mode === 'run' ? await api.run(lesson.id, current) : await api.submit(lesson.id, { code: current });
        if (latestCode.current === current) setDraft('saved');
        setResult(response.result);
        lastResults.set(lesson.id, response.result);
        onProfile(response.profile);
        // The server is authoritative for all of these, including neighbours a pass just unlocked.
        onLesson((l) => ({
          ...l,
          status: response.status,
          attempts: response.attempts,
          xpAtStake: response.xpAtStake,
          xpAwarded: response.rewards?.xp?.total ?? l.xpAwarded,
          next: response.next,
          prev: response.prev,
        }));
        if (!response.scored) setNote('unscored');
        else if (mode === 'submit' && response.alreadyPassed) setNote('alreadyPassed');
        if (response.rewards) {
          setRewards(response.rewards);
          setShowRewards(true);
          onProgress();
        }
      } catch (e) {
        if (e instanceof ApiUnavailable) setUnavailable(e.message);
        else setUnavailable(e instanceof Error ? e.message : String(e));
        // The request may never have reached the server: re-arm the draft save.
        if (wasDirty || latestCode.current !== current) void saveNow(latestCode.current);
      } finally {
        inflight.current = false;
        setBusy(null);
      }
    },
    [lesson.id, onLesson, onProfile, onProgress, saveNow],
  );

  // Keep the handlers reachable from a CodeMirror keymap created once.
  const actions = useRef({ run: () => {}, submit: () => {} });
  actions.current = { run: () => void handle('run'), submit: () => void handle('submit') };

  const extensions = useMemo(() => {
    const lang =
      lesson.kind === 'sql'
        ? sql()
        : lesson.kind === 'react'
          ? javascript({ jsx: true, typescript: true })
          : lesson.kind === 'ts' || lesson.kind === 'typecheck' || lesson.kind === 'mutation'
            ? javascript({ typescript: true })
            : javascript();
    // Highest precedence so Mod-Enter beats the default "insert blank line".
    const keys = Prec.highest(
      keymap.of([
        { key: 'Mod-Enter', run: () => (actions.current.run(), true) },
        { key: 'Mod-Shift-Enter', run: () => (actions.current.submit(), true) },
      ]),
    );
    return [lang, keys, EditorView.lineWrapping];
  }, [lesson.kind]);

  /* ------------------------------------------------------ reset / solution */

  const doReset = async () => {
    setConfirm(null);
    setCode(lesson.pristineStarter);
    await saveNow(lesson.pristineStarter);
  };

  const reveal = async () => {
    setConfirm(null);
    try {
      const { solution, xpIfPassed } = await api.reveal(lesson.id);
      onLesson((l) => ({ ...l, solution, solutionRevealed: true, xpAtStake: passed ? l.xpAtStake : xpIfPassed }));
      setShowSolution(true);
    } catch (e) {
      setUnavailable(e instanceof Error ? e.message : String(e));
    }
  };

  const copySolution = async () => {
    if (!lesson.solution) return;
    setCode(lesson.solution);
    setShowSolution(false);
    await saveNow(lesson.solution);
  };

  const draftLabel: Record<DraftState, string> = {
    saved: 'Draft saved',
    saving: 'Saving…',
    unsaved: 'Unsaved changes',
    error: 'Draft not saved — server unreachable',
  };

  // aria-disabled rather than disabled while grading, so focus stays on the
  // button the learner pressed instead of dropping to <body>.
  const busyProps = (mode: 'run' | 'submit') => ({
    'aria-disabled': busy ? true : undefined,
    'aria-busy': busy === mode ? true : undefined,
  });

  return (
    <div className="work-pane">
      <div className="toolbar">
        {passed ? (
          <>
            <button className="primary" onClick={() => void handle('run')} {...busyProps('run')}>
              {busy === 'run' ? 'Checking…' : 'Re-check'} <kbd className="kbd-inline">{MOD}↵</kbd>
            </button>
            <button
              className="ghost"
              onClick={() => void handle('submit')}
              {...busyProps('submit')}
              title="Counts a submission; no XP for a cleared lesson"
            >
              {busy === 'submit' ? 'Submitting…' : 'Submit anyway'}
            </button>
          </>
        ) : (
          <>
            <button className="primary" onClick={() => void handle('submit')} {...busyProps('submit')}>
              {busy === 'submit' ? 'Grading…' : 'Submit'} <kbd className="kbd-inline">{MOD}⇧↵</kbd>
            </button>
            <button onClick={() => void handle('run')} {...busyProps('run')} title="Grades without counting an attempt">
              {busy === 'run' ? 'Running…' : 'Run'} <kbd className="kbd-inline">{MOD}↵</kbd>
            </button>
          </>
        )}
        <span className={`draft-status ${draft}`} aria-live="polite">
          {draftLabel[draft]}
        </span>
        <span className="spacer" />
        {passed && <span className="pill pass">cleared</span>}
        {rewards && !showRewards && (
          <button className="ghost small" onClick={() => setShowRewards(true)}>
            View rewards
          </button>
        )}
        <button className="ghost" onClick={() => setConfirm('reset')} disabled={!!busy}>
          Reset
        </button>
        {lesson.hasSolution &&
          (lesson.solutionRevealed && lesson.solution ? (
            <button className="ghost" onClick={() => setShowSolution((s) => !s)} aria-pressed={showSolution}>
              {showSolution ? 'Hide solution' : 'Show solution'}
            </button>
          ) : (
            <button className="ghost" onClick={() => setConfirm('solution')} disabled={!!busy}>
              Solution
            </button>
          ))}
      </div>

      {note === 'alreadyPassed' && (
        <div className="banner info slim">
          <span aria-hidden>ℹ</span>
          <div>Already cleared — re-submits count as submissions but earn no XP.</div>
        </div>
      )}
      {note === 'unscored' && (
        <div className="banner info slim">
          <span aria-hidden>ℹ</span>
          <div>The sandbox could not judge this code, so nothing was counted. Try again in a moment.</div>
        </div>
      )}

      <div className="editor-wrap">
        <CodeMirror
          value={code}
          onChange={onChange}
          theme={oneDark}
          extensions={extensions}
          height="100%"
          basicSetup={{ tabSize: 2, highlightActiveLine: true, foldGutter: false }}
          aria-label="Code editor"
        />
      </div>

      {showSolution && lesson.solution && (
        <section className="solution-pane" aria-label="Reference solution">
          <div className="results-head">
            <span>Reference solution</span>
            <span className="spacer" />
            <button className="ghost small" onClick={copySolution}>
              Copy into editor
            </button>
          </div>
          <CodeMirror
            value={lesson.solution}
            theme={oneDark}
            extensions={extensions}
            editable={false}
            height="220px"
            basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
          />
        </section>
      )}

      <ResultPanel result={result} busy={!!busy} unavailable={unavailable} />

      <Confirm
        open={confirm === 'reset'}
        title="Reset to the starter code?"
        body={<p>Your current code will be replaced and the saved draft overwritten. This cannot be undone.</p>}
        confirmLabel="Reset"
        danger
        onConfirm={doReset}
        onCancel={() => setConfirm(null)}
      />
      <Confirm
        open={confirm === 'solution'}
        title="Reveal the reference solution?"
        body={
          passed ? (
            <p>You have already cleared this lesson, so there is no cost.</p>
          ) : (
            <p>
              A pass after revealing is worth only <strong>20%</strong> of the base XP (about{' '}
              {Math.round(lesson.xp * 0.2)} XP instead of {lesson.xpAtStake}). Your code stays in the editor; the
              solution opens in a panel below it.
            </p>
          )
        }
        confirmLabel="Reveal"
        onConfirm={reveal}
        onCancel={() => setConfirm(null)}
      />

      {rewards && (
        <RewardCard rewards={rewards} lesson={lesson} open={showRewards} onClose={() => setShowRewards(false)} />
      )}
    </div>
  );
}

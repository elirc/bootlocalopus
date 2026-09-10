import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';

import { api, KIND_LABEL, type LessonDetail, type RunResult, type Rewards, type SubmitResponse } from '../api.ts';
import { Markdown, ResultPanel } from '../components/bits.tsx';

export function LessonView({ id, onProgress }: { id: string; onProgress: () => void }) {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLesson(null);
    setError(null);
    api.lesson(id).then(setLesson, (e) => setError(e.message));
  }, [id]);

  if (error) return <div className="loading">{error}</div>;
  if (!lesson) return <div className="loading">Loading lesson…</div>;
  if (!lesson.unlocked) {
    return (
      <div className="page">
        <h1 className="page-title">Locked</h1>
        <div className="page-sub">
          Finish the previous lesson in <a href={`#/track/${lesson.track.id}`}>{lesson.chapter.title}</a> first.
        </div>
      </div>
    );
  }

  return (
    <div className="lesson-layout">
      <Brief lesson={lesson} onLesson={setLesson} />
      {lesson.kind === 'quiz' ? (
        <QuizPane key={lesson.id} lesson={lesson} onProgress={onProgress} />
      ) : (
        <CodePane key={lesson.id} lesson={lesson} onProgress={onProgress} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- brief */

function Brief({ lesson, onLesson }: { lesson: LessonDetail; onLesson: (l: LessonDetail) => void }) {
  const [busy, setBusy] = useState(false);

  const revealHint = async () => {
    setBusy(true);
    try {
      const { hints } = await api.hint(lesson.id);
      onLesson({ ...lesson, hints });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lesson-pane">
      <div className="lesson-header">
        <div className="lesson-crumbs">
          <a href={`#/track/${lesson.track.id}`}>{lesson.track.title}</a> / {lesson.chapter.title}
        </div>
        <h1 className="lesson-h1">
          {lesson.title}
          {lesson.boss && <span className="pill boss" style={{ marginLeft: 10, verticalAlign: 'middle' }}>BOSS</span>}
        </h1>
        <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
          <span className="pill">{KIND_LABEL[lesson.kind]}</span>
          <span className={`pill ${lesson.status === 'passed' ? 'pass' : 'accent'}`}>
            {lesson.status === 'passed' ? `cleared · +${lesson.xpAwarded} XP` : `${lesson.xp} XP`}
          </span>
          {lesson.attempts > 0 && lesson.status !== 'passed' && (
            <span className="pill">{lesson.attempts} attempt{lesson.attempts === 1 ? '' : 's'}</span>
          )}
          {lesson.tags.map((tag) => (
            <span key={tag} className="pill" style={{ opacity: 0.75 }}>
              {tag}
            </span>
          ))}
        </div>
        <div className="lesson-whyline">
          <strong style={{ color: 'var(--accent)' }}>Why this matters:</strong> {lesson.why}
        </div>
      </div>

      <Markdown source={lesson.brief} />

      {lesson.kind === 'sql' && lesson.fixtures ? (
        <details style={{ marginTop: 20 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-dim)' }}>
            Show the schema and seed data
          </summary>
          <Markdown source={'```sql\n' + lesson.fixtures.trim() + '\n```'} />
        </details>
      ) : null}

      {lesson.hintCount > 0 && (
        <div style={{ marginTop: 26 }}>
          <div className="card-title">
            Hints ({lesson.hints.length}/{lesson.hintCount})
          </div>
          {lesson.hints.map((hint, i) => (
            <div className="hint" key={i}>
              <div className="hint-number">Hint {i + 1}</div>
              <Markdown source={hint} />
            </div>
          ))}
          {lesson.hints.length < lesson.hintCount && (
            <button className="ghost" onClick={revealHint} disabled={busy}>
              Reveal hint {lesson.hints.length + 1} <span style={{ color: 'var(--text-faint)' }}>(−12% XP)</span>
            </button>
          )}
        </div>
      )}

      {lesson.prev || lesson.next ? (
        <div className="row" style={{ marginTop: 30, gap: 8 }}>
          {lesson.prev && (
            <a href={`#/lesson/${lesson.prev}`}>
              <button className="ghost">← Previous</button>
            </a>
          )}
          {lesson.next && (
            <a href={`#/lesson/${lesson.next}`}>
              <button className="ghost">Next →</button>
            </a>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- code pane */

function CodePane({ lesson, onProgress }: { lesson: LessonDetail; onProgress: () => void }) {
  const [code, setCode] = useState(lesson.starter);
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState<'run' | 'submit' | null>(null);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [passed, setPassed] = useState(lesson.status === 'passed');
  const saveTimer = useRef<number | undefined>(undefined);

  const extensions = useMemo(() => {
    if (lesson.kind === 'sql') return [sql()];
    if (lesson.kind === 'react') return [javascript({ jsx: true, typescript: true })];
    if (lesson.kind === 'ts' || lesson.kind === 'typecheck') return [javascript({ typescript: true })];
    return [javascript()];
  }, [lesson.kind]);

  // Debounced draft save, so a reload never loses work.
  const onChange = useCallback(
    (value: string) => {
      setCode(value);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void api.saveDraft(lesson.id, value).catch(() => {});
      }, 800);
    },
    [lesson.id],
  );

  const handle = useCallback(
    async (mode: 'run' | 'submit') => {
      setBusy(mode);
      setResult(null);
      try {
        const response: SubmitResponse =
          mode === 'run' ? await api.run(lesson.id, code) : await api.submit(lesson.id, { code });
        setResult(response.result);
        if (response.rewards) {
          setRewards(response.rewards);
          setPassed(true);
          onProgress();
        } else if (response.result.ok && mode === 'submit') {
          setPassed(true);
        }
      } catch (e) {
        setResult({
          ok: false,
          tests: [],
          logs: [],
          ms: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setBusy(null);
      }
    },
    [code, lesson.id, onProgress],
  );

  // Ctrl/Cmd+Enter submits, the way every editor-shaped tool does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!busy) void handle('submit');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, handle]);

  const reveal = async () => {
    if (!window.confirm('Reveal the reference solution? A pass after this is worth 20% of the XP.')) return;
    const { solution } = await api.reveal(lesson.id);
    setCode(solution);
    void api.saveDraft(lesson.id, solution).catch(() => {});
  };

  return (
    <div className="work-pane">
      <div className="toolbar">
        <button className="primary" onClick={() => handle('submit')} disabled={!!busy}>
          {busy === 'submit' ? 'Grading…' : 'Submit'} <span style={{ opacity: 0.6 }}>⌘↵</span>
        </button>
        <button onClick={() => handle('run')} disabled={!!busy}>
          {busy === 'run' ? 'Running…' : 'Run'}
        </button>
        <span className="spacer" />
        {passed && <span className="pill pass">cleared</span>}
        <button className="ghost" onClick={() => setCode(lesson.pristineStarter)} disabled={!!busy}>
          Reset
        </button>
        {lesson.hasSolution && (
          <button className="ghost" onClick={reveal} disabled={!!busy}>
            Solution
          </button>
        )}
      </div>

      <div className="editor-wrap">
        <CodeMirror
          value={code}
          onChange={onChange}
          theme={oneDark}
          extensions={extensions}
          height="100%"
          basicSetup={{ tabSize: 2, highlightActiveLine: true, foldGutter: false }}
        />
      </div>

      <ResultPanel result={result} busy={!!busy} />

      {rewards && (
        <RewardCard
          rewards={rewards}
          lesson={lesson}
          onClose={() => setRewards(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- quiz pane */

function QuizPane({ lesson, onProgress }: { lesson: LessonDetail; onProgress: () => void }) {
  const questions = lesson.quiz ?? [];
  const [answers, setAnswers] = useState<number[][]>(() => questions.map(() => []));
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [explanations, setExplanations] = useState<{ answer: number[]; explain: string }[] | null>(null);

  useEffect(() => {
    if (lesson.status === 'passed') {
      api.quizAnswers(lesson.id).then((r) => setExplanations(r.answers), () => {});
    }
  }, [lesson.id, lesson.status]);

  const toggle = (qi: number, oi: number, multi: boolean) => {
    setAnswers((current) =>
      current.map((picked, i) => {
        if (i !== qi) return picked;
        if (!multi) return [oi];
        return picked.includes(oi) ? picked.filter((n) => n !== oi) : [...picked, oi];
      }),
    );
  };

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const response = await api.submit(lesson.id, { answers });
      setResult(response.result);
      if (response.rewards) {
        setRewards(response.rewards);
        onProgress();
        api.quizAnswers(lesson.id).then((r) => setExplanations(r.answers), () => {});
      }
    } catch (e) {
      setResult({ ok: false, tests: [], logs: [], ms: 0, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const answered = answers.every((picked) => picked.length > 0);
  const graded = result?.tests ?? [];

  return (
    <div className="work-pane" style={{ overflowY: 'auto' }}>
      <div className="toolbar">
        <button className="primary" onClick={submit} disabled={busy || !answered}>
          {busy ? 'Checking…' : 'Submit answers'}
        </button>
        <span className="spacer" />
        {!answered && <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>Answer every question to submit</span>}
        {lesson.status === 'passed' && <span className="pill pass">cleared</span>}
      </div>

      <div style={{ padding: 22, overflowY: 'auto' }}>
        {result && !result.ok && (
          <div
            className="banner fail"
            style={{ borderRadius: 'var(--radius)', border: '1px solid rgba(248,81,73,0.25)', marginBottom: 16 }}
          >
            <span>⚠</span>
            <div>
              <strong>
                {graded.filter((t) => t.passed).length} of {graded.length} correct.
              </strong>{' '}
              Every answer has to be right — read the explanations below and try again.
            </div>
          </div>
        )}

        {questions.map((question, qi) => {
          const outcome = graded[qi];
          const explanation = outcome?.error ?? explanations?.[qi]?.explain;
          const correctSet = explanations?.[qi]?.answer;
          return (
            <div
              key={qi}
              className={`quiz-q${outcome ? (outcome.passed ? ' correct' : ' wrong') : ''}`}
            >
              {question.multi && <div className="quiz-multi">Select all that apply</div>}
              <div className="quiz-prompt">
                <Markdown source={`${qi + 1}. ${question.q}`} />
              </div>
              {question.options.map((option, oi) => {
                const selected = answers[qi].includes(oi);
                const isCorrect = correctSet?.includes(oi);
                return (
                  <label
                    key={oi}
                    className={`option${selected ? ' selected' : ''}`}
                    style={
                      correctSet
                        ? {
                            borderColor: isCorrect ? '#1f6f2c' : selected ? '#7a2620' : 'var(--border)',
                            background: isCorrect ? 'rgba(63,185,80,0.07)' : undefined,
                          }
                        : undefined
                    }
                  >
                    <input
                      type={question.multi ? 'checkbox' : 'radio'}
                      name={`q-${qi}`}
                      checked={selected}
                      onChange={() => toggle(qi, oi, question.multi)}
                    />
                    <span>
                      <Markdown source={option} />
                    </span>
                  </label>
                );
              })}
              {explanation && (
                <div className="explain">
                  <strong>{outcome && !outcome.passed ? 'Not quite. ' : 'Why: '}</strong>
                  {explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {rewards && <RewardCard rewards={rewards} lesson={lesson} onClose={() => setRewards(null)} />}
    </div>
  );
}

/* -------------------------------------------------------------- reward card */

function RewardCard({
  rewards,
  lesson,
  onClose,
}: {
  rewards: Rewards;
  lesson: LessonDetail;
  onClose: () => void;
}) {
  const xp = rewards.xp;
  const total = (xp?.total ?? 0) + rewards.questXp + rewards.achievementXp;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="reward" onClick={(e) => e.stopPropagation()}>
        <div className="reward-head">
          <div className="reward-eyebrow">{lesson.boss ? 'Boss defeated' : 'Lesson cleared'}</div>
          <div className="reward-xp">+{total}</div>
          <div className="reward-title">XP earned</div>
        </div>

        {xp && (
          <div>
            <div className="reward-line">
              <span>Base</span>
              <span className="value">{xp.base}</span>
            </div>
            {xp.hintPenalty > 0 && (
              <div className="reward-line penalty">
                <span>Hints used</span>
                <span className="value">−{xp.hintPenalty}</span>
              </div>
            )}
            {xp.solutionPenalty > 0 && (
              <div className="reward-line penalty">
                <span>Solution revealed</span>
                <span className="value">−{xp.solutionPenalty}</span>
              </div>
            )}
            {xp.firstTryBonus > 0 && (
              <div className="reward-line bonus">
                <span>First try</span>
                <span className="value">+{xp.firstTryBonus}</span>
              </div>
            )}
            {xp.comboBonus > 0 && (
              <div className="reward-line bonus">
                <span>Combo ×{rewards.combo}</span>
                <span className="value">+{xp.comboBonus}</span>
              </div>
            )}
            {rewards.questXp > 0 && (
              <div className="reward-line bonus">
                <span>Daily quests</span>
                <span className="value">+{rewards.questXp}</span>
              </div>
            )}
            {rewards.achievementXp > 0 && (
              <div className="reward-line bonus">
                <span>Achievements</span>
                <span className="value">+{rewards.achievementXp}</span>
              </div>
            )}
          </div>
        )}

        {rewards.leveledUp && (
          <div className="reward-banner">
            <div className="reward-banner-title">Level {rewards.leveledUp.to}</div>
            <div className="reward-banner-sub">You are now {rewards.leveledUp.rank}</div>
          </div>
        )}

        {rewards.streak.current > 1 && (
          <div className="reward-line" style={{ marginTop: 12 }}>
            <span>🔥 Streak</span>
            <span className="value">
              {rewards.streak.current} days{rewards.streak.usedFreeze ? ' (freeze used)' : ''}
            </span>
          </div>
        )}

        {rewards.questsFinished.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="card-title" style={{ marginBottom: 6 }}>Quests completed</div>
            {rewards.questsFinished.map((quest) => (
              <div className="reward-line bonus" key={quest.id}>
                <span>◆ {quest.label}</span>
                <span className="value">+{quest.xp}</span>
              </div>
            ))}
          </div>
        )}

        {rewards.newAchievements.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="card-title" style={{ marginBottom: 4 }}>New achievements</div>
            {rewards.newAchievements.map((badge) => (
              <div className="badge-row" key={badge.id}>
                <span className="badge-icon">{badge.icon}</span>
                <div style={{ flex: 1 }}>
                  <div className="badge-title">{badge.title}</div>
                  <div className="badge-detail">{badge.detail}</div>
                </div>
                <span className="pill accent">+{badge.xp}</span>
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 22, gap: 8 }}>
          {lesson.next ? (
            <a href={`#/lesson/${lesson.next}`} style={{ flex: 1 }} onClick={onClose}>
              <button className="primary" style={{ width: '100%' }}>
                Next lesson →
              </button>
            </a>
          ) : (
            <a href={`#/track/${lesson.track.id}`} style={{ flex: 1 }} onClick={onClose}>
              <button className="primary" style={{ width: '100%' }}>
                Back to the track
              </button>
            </a>
          )}
          <button className="ghost" onClick={onClose}>
            Stay here
          </button>
        </div>
      </div>
    </div>
  );
}

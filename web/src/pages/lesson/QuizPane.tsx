import { useEffect, useRef, useState } from 'react';
import { api, ApiUnavailable, type RunResult, type Rewards } from '../../api.ts';
import { InlineMarkdown } from '../../components/bits.tsx';
import type { LessonPaneProps } from '../Lesson.tsx';
import { RewardCard } from './RewardCard.tsx';

export function QuizPane({ lesson, onLesson, onProgress, onProfile }: LessonPaneProps) {
  const questions = lesson.quiz ?? [];
  const [answers, setAnswers] = useState<number[][]>(() => questions.map(() => []));
  const [result, setResult] = useState<RunResult | null>(null);
  /** Questions whose answer changed since the last grading: their verdict no longer applies. */
  const [touched, setTouched] = useState<Set<number>>(() => new Set());
  const [lastScore, setLastScore] = useState<{ correct: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [showRewards, setShowRewards] = useState(false);
  const [explanations, setExplanations] = useState<{ answer: number[]; explain: string }[] | null>(null);
  const inflight = useRef(false);

  const passed = lesson.status === 'passed';

  // Explanations unlock with the pass; this also runs when a submit flips `passed`.
  useEffect(() => {
    if (!passed) return;
    let ignore = false;
    api.quizAnswers(lesson.id).then(
      (r) => {
        if (!ignore) setExplanations(r.answers);
      },
      () => {},
    );
    return () => {
      ignore = true;
    };
  }, [lesson.id, passed]);

  const toggle = (qi: number, oi: number, multi: boolean) => {
    setAnswers((current) =>
      current.map((picked, i) => {
        if (i !== qi) return picked;
        if (!multi) return [oi];
        return picked.includes(oi) ? picked.filter((n) => n !== oi) : [...picked, oi].sort((a, b) => a - b);
      }),
    );
    // Changing an answer invalidates that question's verdict; the score line stays.
    setTouched((current) => (current.has(qi) ? current : new Set(current).add(qi)));
  };

  const answered = answers.every((picked) => picked.length > 0);

  const submit = async () => {
    // aria-disabled keeps the button focusable while busy, so guard here.
    if (inflight.current || !answered) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await api.submit(lesson.id, { answers });
      setResult(response.result);
      setTouched(new Set());
      setLastScore({ correct: response.result.tests.filter((t) => t.passed).length, total: response.result.tests.length });
      onProfile(response.profile);
      onLesson((l) => ({
        ...l,
        status: response.status,
        attempts: response.attempts,
        xpAtStake: response.xpAtStake,
        xpAwarded: response.rewards?.xp?.total ?? l.xpAwarded,
        next: response.next,
        prev: response.prev,
      }));
      if (response.rewards) {
        setRewards(response.rewards);
        setShowRewards(true);
        onProgress();
      }
    } catch (e) {
      setError(e instanceof ApiUnavailable ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };

  const graded = result?.tests ?? [];

  return (
    <div className="work-pane scroll">
      <div className="toolbar sticky">
        <button
          className="primary"
          onClick={submit}
          disabled={!answered}
          aria-disabled={busy ? true : undefined}
          aria-busy={busy ? true : undefined}
          title={passed ? 'Counts as a submission; a cleared quiz earns no more XP' : undefined}
        >
          {busy ? 'Checking…' : passed ? 'Submit again (no XP)' : 'Submit answers'}
        </button>
        {lastScore && (
          <span className={`pill ${lastScore.correct === lastScore.total ? 'pass' : 'fail'}`} role="status">
            {lastScore.correct} / {lastScore.total} correct
          </span>
        )}
        <span className="spacer" />
        {!answered && <span className="faint" style={{ fontSize: 12.5 }}>Answer every question to submit</span>}
        {passed && <span className="pill pass">cleared</span>}
        {rewards && !showRewards && (
          <button className="ghost small" onClick={() => setShowRewards(true)}>
            View rewards
          </button>
        )}
      </div>

      <div className="quiz-body">
        {error && (
          <div className="banner info card-banner" role="alert">
            <span aria-hidden>⚠</span>
            <div>{error}</div>
          </div>
        )}

        {result && !result.ok && (
          <div className="banner fail card-banner" role="alert">
            <span aria-hidden>✕</span>
            <div>
              <strong>Not every answer is right yet.</strong>{' '}
              {passed
                ? 'You have already cleared this quiz, so nothing is lost.'
                : 'Change the ones marked below and submit again — every question has to be correct to clear the quiz.'}
            </div>
          </div>
        )}

        {questions.map((question, qi) => {
          const outcome = touched.has(qi) ? undefined : graded[qi];
          const verdict = outcome ? (outcome.passed ? 'correct' : 'wrong') : null;
          // The server never explains a wrong answer (it would name the right one);
          // explanations arrive only once the quiz is cleared, and then always apply.
          const explanation = explanations?.[qi]?.explain;
          const correctSet = explanations?.[qi]?.answer;
          return (
            <fieldset key={qi} className={`quiz-q${verdict ? ' ' + verdict : ''}`}>
              <legend className="quiz-prompt">
                <span className="quiz-number">{qi + 1}.</span>
                <InlineMarkdown source={question.q} />
              </legend>
              {question.multi && <div className="quiz-multi">Select all that apply</div>}
              {verdict === 'correct' && <div className="quiz-verdict pass">✓ Correct</div>}
              {verdict === 'wrong' && <div className="quiz-verdict fail">✕ Not quite</div>}
              {question.options.map((option, oi) => {
                const selected = answers[qi].includes(oi);
                const isCorrect = correctSet?.includes(oi);
                const cls = [
                  'option',
                  selected ? 'selected' : '',
                  correctSet ? (isCorrect ? 'is-correct' : selected ? 'is-wrong' : '') : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <label key={oi} className={cls}>
                    <input
                      type={question.multi ? 'checkbox' : 'radio'}
                      name={`q-${qi}`}
                      checked={selected}
                      onChange={() => toggle(qi, oi, question.multi)}
                    />
                    <InlineMarkdown source={option} />
                    {correctSet && isCorrect && <span className="visually-hidden">(correct answer)</span>}
                  </label>
                );
              })}
              {explanation && (
                <div className="explain">
                  <strong>Why: </strong>
                  {explanation}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      {rewards && (
        <RewardCard rewards={rewards} lesson={lesson} open={showRewards} onClose={() => setShowRewards(false)} />
      )}
    </div>
  );
}

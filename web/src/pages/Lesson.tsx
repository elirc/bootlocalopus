import { useEffect, useState } from 'react';
import { api, ApiError, KIND_LABEL, type LessonDetail, type Profile } from '../api.ts';
import { LinkButton, Markdown, useDocumentTitle } from '../components/bits.tsx';
import { CodePane } from './lesson/CodePane.tsx';
import { QuizPane } from './lesson/QuizPane.tsx';

export interface LessonPaneProps {
  lesson: LessonDetail;
  onLesson: (update: (l: LessonDetail) => LessonDetail) => void;
  onProgress: () => void;
  onProfile: (p: Profile) => void;
}

export function LessonView({
  id,
  onProgress,
  onProfile,
  onTrack,
}: {
  id: string;
  onProgress: () => void;
  onProfile: (p: Profile) => void;
  onTrack: (trackId: string | null) => void;
}) {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  useEffect(() => {
    // A fast back-and-forth between lessons must not let the older response
    // win, or drafts would be saved against the wrong lesson.
    let ignore = false;
    setLesson(null);
    setError(null);
    api.lesson(id).then(
      (l) => {
        if (ignore) return;
        setLesson(l);
        onTrack(l.track.id);
      },
      (e) => {
        if (ignore) return;
        setError({ message: e.message, status: e instanceof ApiError ? e.status : undefined });
      },
    );
    return () => {
      ignore = true;
    };
  }, [id, onTrack]);

  useDocumentTitle(lesson ? lesson.title : 'Lesson');

  const update = (fn: (l: LessonDetail) => LessonDetail) =>
    setLesson((current) => (current ? fn(current) : current));

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">{error.status === 404 ? 'No such lesson' : 'Could not load this lesson'}</h1>
        <p className="page-sub">{error.message}</p>
        <p>
          <LinkButton href="#/tracks" ghost>
            ← Back to the tracks
          </LinkButton>
        </p>
      </div>
    );
  }
  if (!lesson) return <div className="loading">Loading lesson…</div>;

  if (!lesson.unlocked) {
    return (
      <div className="page">
        <h1 className="page-title">🔒 {lesson.title}</h1>
        <p className="page-sub">{lesson.lockReason ?? 'Finish the previous lesson first.'}</p>
        <p>
          <LinkButton href={`#/track/${lesson.track.id}`} primary>
            Open {lesson.track.title}
          </LinkButton>
        </p>
      </div>
    );
  }

  const paneProps: LessonPaneProps = { lesson, onLesson: update, onProgress, onProfile };

  return (
    <div className="lesson-layout">
      <Brief lesson={lesson} onLesson={update} />
      {lesson.kind === 'quiz' ? <QuizPane key={lesson.id} {...paneProps} /> : <CodePane key={lesson.id} {...paneProps} />}
    </div>
  );
}

/* ------------------------------------------------------------------- brief */

function Brief({ lesson, onLesson }: { lesson: LessonDetail; onLesson: LessonPaneProps['onLesson'] }) {
  const [busy, setBusy] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const passed = lesson.status === 'passed';

  const revealHint = async () => {
    setBusy(true);
    setHintError(null);
    try {
      const { hints, xpAtStake } = await api.hint(lesson.id);
      onLesson((l) => ({ ...l, hints, hintsUsed: hints.length, xpAtStake }));
    } catch (e) {
      setHintError(e instanceof Error ? e.message : String(e));
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
          {passed ? (
            <span className="pill pass">cleared · +{lesson.xpAwarded} XP</span>
          ) : (
            <span
              className="pill accent"
              title={
                lesson.xpAtStake > lesson.xp
                  ? `${lesson.xp} XP base plus the clean bonus for passing with no hints`
                  : lesson.xpAtStake < lesson.xp
                    ? `Reduced from ${lesson.xp} XP by the hints or the solution you opened`
                    : 'What a pass is worth right now'
              }
            >
              worth {lesson.xpAtStake} XP
              {lesson.xpAtStake > lesson.xp && <span className="pill-note"> incl. clean bonus</span>}
              {lesson.xpAtStake < lesson.xp && <span className="pill-note"> (base {lesson.xp})</span>}
            </span>
          )}
          {lesson.attempts > 0 && !passed && (
            <span className="pill">{lesson.attempts} attempt{lesson.attempts === 1 ? '' : 's'}</span>
          )}
          {lesson.tags.map((tag) => (
            <span key={tag} className="pill tag">
              {tag}
            </span>
          ))}
        </div>
        <div className="lesson-whyline">
          <strong className="accent">Why this matters:</strong> {lesson.why}
        </div>
      </div>

      <Markdown source={lesson.brief} />

      {(lesson.kind === 'sql' || lesson.kind === 'node-db') && lesson.fixtures ? (
        <details className="disclosure" style={{ marginTop: 20 }}>
          <summary>Show the schema and seed data</summary>
          <Markdown source={'```sql\n' + lesson.fixtures.trim() + '\n```'} />
        </details>
      ) : null}

      {lesson.kind === 'mutation' && lesson.subject ? (
        <details className="disclosure" style={{ marginTop: 20 }} open>
          <summary>The implementation under test</summary>
          <Markdown source={'```ts\n' + lesson.subject.trim() + '\n```'} />
        </details>
      ) : null}

      {lesson.hintCount > 0 && (
        <section style={{ marginTop: 26 }} aria-label="Hints">
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
              Reveal hint {lesson.hints.length + 1}
              {!passed && !lesson.solutionRevealed && <span className="faint"> (−{lesson.hintCost} XP)</span>}
            </button>
          )}
          {hintError && <div className="inline-error">{hintError}</div>}
        </section>
      )}

      <nav className="row wrap" style={{ marginTop: 30, gap: 8 }} aria-label="Lesson navigation">
        {lesson.prev && (
          <LinkButton href={`#/lesson/${lesson.prev.id}`} ghost>
            ← {lesson.prev.title}
          </LinkButton>
        )}
        {lesson.next &&
          (lesson.next.unlocked ? (
            <LinkButton href={`#/lesson/${lesson.next.id}`} ghost>
              {lesson.next.title} →
            </LinkButton>
          ) : (
            <span className="btn ghost disabled" aria-disabled title="Unlocks when you pass this lesson">
              🔒 {lesson.next.title}
            </span>
          ))}
      </nav>
    </div>
  );
}

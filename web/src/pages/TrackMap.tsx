import type { AppState, ChapterSummary, LessonSummary, TrackSummary } from '../api.ts';
import { KIND_LABEL } from '../api.ts';
import { Bar } from '../components/bits.tsx';

export function TrackMap({ state, trackId }: { state: AppState; trackId?: string }) {
  const track = trackId ? state.tracks.find((t) => t.id === trackId) : undefined;
  if (trackId && !track) {
    return (
      <div className="page">
        <h1 className="page-title">No such track</h1>
        <p className="page-sub">
          <a href="#/tracks">Back to all tracks</a>
        </p>
      </div>
    );
  }
  if (track) return <SingleTrack track={track} />;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Tracks</h1>
        <div className="page-sub">
          {state.tracks.length} tracks, {state.profile.lessonsTotal} lessons,{' '}
          {state.profile.xpAvailable.toLocaleString()} XP. A chapter opens once 70% of the one before it is
          done, so one hard lesson never walls you off.
        </div>
      </div>

      <div className="grid cols-2">
        {state.tracks.map((track) => {
          const pct = track.total ? Math.round((track.passed / track.total) * 100) : 0;
          return (
            <a key={track.id} href={`#/track/${track.id}`} className="card track-card">
              <div className="row">
                <div className="track-badge" style={{ background: `${track.color}22`, color: track.color }} aria-hidden>
                  {track.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="track-name">{track.title}</div>
                  <div className="quest-meta">
                    {track.chapters.length} chapters · {track.total} lessons
                  </div>
                </div>
                <span className="spacer" />
                <span className={`pill${pct === 100 ? ' pass' : pct > 0 ? ' accent' : ''}`}>{pct}%</span>
              </div>
              <div className="track-blurb">{track.blurb}</div>
              <Bar pct={pct} tone={pct === 100 ? 'pass' : undefined} label={`${track.title} progress`} />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function SingleTrack({ track }: { track: TrackSummary }) {
  const pct = track.total ? Math.round((track.passed / track.total) * 100) : 0;
  return (
    <div className="page">
      <div className="page-head">
        <div className="lesson-crumbs">
          <a href="#/tracks">Tracks</a> / {track.title}
        </div>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <div className="track-badge large" style={{ background: `${track.color}22`, color: track.color }} aria-hidden>
            {track.icon}
          </div>
          <div style={{ flex: 1 }}>
            <h1 className="page-title">{track.title}</h1>
            <div className="page-sub">{track.blurb}</div>
          </div>
        </div>
        <div style={{ marginTop: 16, maxWidth: 420 }}>
          <div className="row between" style={{ fontSize: 12.5, marginBottom: 5 }}>
            <span className="muted">
              {track.passed} of {track.total} cleared
            </span>
            <strong className={pct === 100 ? 'pass-text' : 'accent'}>{pct}%</strong>
          </div>
          <Bar pct={pct} tone={pct === 100 ? 'pass' : undefined} label={`${track.title} progress`} />
        </div>
      </div>

      {track.chapters.map((chapter, index) => (
        <Chapter key={chapter.id} chapter={chapter} index={index} />
      ))}
    </div>
  );
}

function Chapter({ chapter, index }: { chapter: ChapterSummary; index: number }) {
  const complete = chapter.passed === chapter.total && chapter.total > 0;
  return (
    <section className={`chapter${chapter.unlocked ? '' : ' locked'}`} aria-label={chapter.title}>
      <div className="chapter-head">
        <div className={`marker${complete ? ' passed' : ''}`} aria-hidden>
          {complete ? '✓' : index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <h2 className="chapter-title">{chapter.title}</h2>
          <div className="chapter-summary">{chapter.summary}</div>
        </div>
        <span className={`pill${complete ? ' pass' : ''}`}>
          {chapter.passed}/{chapter.total}
        </span>
        {!chapter.unlocked && <span className="pill">🔒 locked</span>}
      </div>
      {chapter.lessons.map((lesson) => (
        <LessonRow key={lesson.id} lesson={lesson} />
      ))}
    </section>
  );
}

function LessonRow({ lesson }: { lesson: LessonSummary }) {
  const className = ['lesson-row', lesson.unlocked ? '' : 'locked', lesson.boss ? 'boss' : '']
    .filter(Boolean)
    .join(' ');

  const statusWord =
    lesson.status === 'passed' ? 'cleared' : lesson.status === 'attempted' ? 'in progress' : lesson.unlocked ? 'open' : 'locked';

  const body = (
    <>
      <div className={`marker ${lesson.status}`} aria-hidden>
        {lesson.status === 'passed' ? '✓' : lesson.status === 'attempted' ? '…' : lesson.unlocked ? (lesson.boss ? '☠' : '') : '🔒'}
      </div>
      <span className="visually-hidden">{statusWord}: </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lesson-title">
          {lesson.title}
          {lesson.boss && <span className="pill boss" style={{ marginLeft: 8 }}>BOSS</span>}
        </div>
        <div className="lesson-why">{lesson.why}</div>
      </div>
      <span className="pill">{KIND_LABEL[lesson.kind]}</span>
      {lesson.status === 'passed' ? (
        <span className="pill pass">+{lesson.xpAwarded} XP</span>
      ) : (
        <span className="pill accent">{lesson.xp} XP</span>
      )}
      {lesson.status === 'passed' && lesson.clean && <span className="pill pass">clean</span>}
    </>
  );

  if (!lesson.unlocked) return <div className={className}>{body}</div>;
  return (
    <a className={className} href={`#/lesson/${lesson.id}`}>
      {body}
    </a>
  );
}

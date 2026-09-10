import type { AppState, ChapterSummary, LessonSummary, TrackSummary } from '../api.ts';
import { KIND_LABEL } from '../api.ts';
import { Bar } from '../components/bits.tsx';

export function TrackMap({ state, trackId }: { state: AppState; trackId?: string }) {
  const track = trackId ? state.tracks.find((t) => t.id === trackId) : undefined;
  if (track) return <SingleTrack track={track} />;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Tracks</h1>
        <div className="page-sub">
          Six tracks, {state.profile.lessonsTotal} lessons, {state.profile.xpAvailable.toLocaleString()} XP.
          A chapter opens once 70% of the one before it is done, so one hard lesson never walls you off.
        </div>
      </div>

      <div className="grid cols-2">
        {state.tracks.map((track) => {
          const pct = track.total ? Math.round((track.passed / track.total) * 100) : 0;
          return (
            <a key={track.id} href={`#/track/${track.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card track-card">
                <div className="row">
                  <div className="track-badge" style={{ background: `${track.color}22`, color: track.color }}>
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
                <Bar pct={pct} tone={pct === 100 ? 'pass' : undefined} />
              </div>
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
          <div
            className="track-badge"
            style={{ background: `${track.color}22`, color: track.color, width: 44, height: 44, flex: '0 0 44px', fontSize: 16 }}
          >
            {track.icon}
          </div>
          <div style={{ flex: 1 }}>
            <h1 className="page-title">{track.title}</h1>
            <div className="page-sub">{track.blurb}</div>
          </div>
        </div>
        <div style={{ marginTop: 16, maxWidth: 420 }}>
          <div className="row between" style={{ fontSize: 12.5, marginBottom: 5 }}>
            <span style={{ color: 'var(--text-dim)' }}>
              {track.passed} of {track.total} cleared
            </span>
            <strong style={{ color: pct === 100 ? 'var(--pass)' : 'var(--accent)' }}>{pct}%</strong>
          </div>
          <Bar pct={pct} tone={pct === 100 ? 'pass' : undefined} />
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
    <div className={`chapter${chapter.unlocked ? '' : ' locked'}`}>
      <div className="chapter-head">
        <div className="marker" style={complete ? undefined : { borderColor: 'var(--border-strong)' }}>
          {complete ? '✓' : index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div className="chapter-title">{chapter.title}</div>
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
    </div>
  );
}

function LessonRow({ lesson }: { lesson: LessonSummary }) {
  const className = [
    'lesson-row',
    lesson.unlocked ? '' : 'locked',
    lesson.boss ? 'boss' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <div className={`marker ${lesson.status}`}>
        {lesson.status === 'passed' ? '✓' : lesson.unlocked ? (lesson.boss ? '☠' : '') : '🔒'}
      </div>
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
      {lesson.status === 'passed' && lesson.firstTry && <span className="pill pass">first try</span>}
    </>
  );

  if (!lesson.unlocked) return <div className={className}>{body}</div>;
  return (
    <a className={className} href={`#/lesson/${lesson.id}`}>
      {body}
    </a>
  );
}

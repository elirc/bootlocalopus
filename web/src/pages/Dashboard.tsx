import type { AppState } from '../api.ts';
import { Bar, LevelRing, QuestList, Stat, relativeTime } from '../components/bits.tsx';

export function Dashboard({ state }: { state: AppState }) {
  const { profile, quests, tracks, nextUp, history } = state;
  const trackById = Object.fromEntries(tracks.map((t) => [t.id, t]));

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Welcome back</h1>
        <div className="page-sub">
          {profile.lessonsPassed === 0
            ? 'Nothing cleared yet. Start anywhere — the first chapter of every track is open.'
            : `${profile.lessonsPassed} of ${profile.lessonsTotal} lessons cleared, ${profile.xp.toLocaleString()} XP earned.`}
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="hero">
            <LevelRing level={profile.level} pct={profile.levelPct} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div className="rank">{profile.rank}</div>
              <div className="rank-note">{profile.rankNote}</div>
              <div style={{ marginTop: 12 }}>
                <Bar pct={profile.levelPct} />
                <div className="quest-meta" style={{ marginTop: 5 }}>
                  {profile.levelInto} / {profile.levelNeed} XP to level {profile.level + 1}
                </div>
              </div>
              {profile.nextRank && (
                <div className="rank-next">
                  Next rank: <strong>{profile.nextRank.title}</strong> at level {profile.nextRank.atLevel}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Mid-level readiness</div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <div className="stat-value" style={{ fontSize: 34, color: 'var(--accent)' }}>
              {profile.readiness}%
            </div>
            <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--text-dim)' }}>
              weighted across
              <br />
              all six tracks
            </div>
          </div>
          <Bar pct={profile.readiness} />
          <div className="grid cols-3" style={{ marginTop: 18, gap: 12 }}>
            <Stat value={profile.streak.current} label="day streak" hint={`best ${profile.streak.longest}`} />
            <Stat
              value={`×${profile.comboMultiplier.toFixed(2)}`}
              label="combo"
              hint={profile.combo > 0 ? `${profile.combo} first-try in a row` : 'pass first try to build it'}
            />
            <Stat
              value={`${profile.achievementsEarned}/${profile.achievementsTotal}`}
              label="badges"
            />
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Continue</div>
          {nextUp ? (
            <div>
              <div style={{ fontSize: 17, fontWeight: 620, marginBottom: 3 }}>{nextUp.title}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 15 }}>{nextUp.track}</div>
              <a href={`#/lesson/${nextUp.id}`}>
                <button className="primary">Open lesson →</button>
              </a>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 17, fontWeight: 620, marginBottom: 6 }}>
                Everything unlocked is cleared. 🎖
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                That is the whole curriculum. Go build something with it.
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Today&rsquo;s quests</div>
          <QuestList quests={quests} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Tracks</div>
        <div className="grid cols-3">
          {tracks.map((track) => {
            const pct = track.total ? Math.round((track.passed / track.total) * 100) : 0;
            return (
              <a
                key={track.id}
                href={`#/track/${track.id}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <div style={{ padding: '4px 0' }}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <div
                      className="track-badge"
                      style={{ background: `${track.color}22`, color: track.color }}
                    >
                      {track.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="track-name" style={{ fontSize: 14 }}>
                        {track.title}
                      </div>
                      <div className="quest-meta">
                        {track.passed}/{track.total} lessons · {pct}%
                      </div>
                    </div>
                  </div>
                  <Bar pct={pct} tone={pct === 100 ? 'pass' : undefined} />
                </div>
              </a>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recent activity</div>
        {history.length === 0 ? (
          <div className="empty">Nothing yet — clear a lesson and it will show up here.</div>
        ) : (
          <div>
            {history.slice(0, 12).map((entry, i) => (
              <div className="timeline-item" key={i}>
                <span style={{ width: 16 }}>
                  {entry.kind === 'pass'
                    ? '✓'
                    : entry.kind === 'fail'
                      ? '✕'
                      : entry.kind === 'achievement'
                        ? '★'
                        : entry.kind === 'levelup'
                          ? '▲'
                          : entry.kind === 'quest'
                            ? '◆'
                            : '·'}
                </span>
                <span
                  style={{
                    color:
                      entry.kind === 'fail'
                        ? 'var(--text-faint)'
                        : entry.kind === 'achievement' || entry.kind === 'levelup'
                          ? 'var(--accent)'
                          : 'inherit',
                  }}
                >
                  {entry.lessonId ? (
                    <a href={`#/lesson/${entry.lessonId}`} style={{ color: 'inherit' }}>
                      {entry.label}
                    </a>
                  ) : (
                    entry.label
                  )}
                </span>
                {entry.xp ? <span className="timeline-xp">+{entry.xp}</span> : null}
                <span className="timeline-when">{relativeTime(entry.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

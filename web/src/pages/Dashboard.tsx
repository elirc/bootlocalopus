import type { AppState } from '../api.ts';
import { Bar, LevelRing, LinkButton, QuestList, Stat, Timeline } from '../components/bits.tsx';

export function Dashboard({ state }: { state: AppState }) {
  const { profile, quests, tracks, nextUp, history } = state;
  const firstRun = profile.lessonsPassed === 0 && history.length === 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{firstRun ? 'Welcome' : 'Welcome back'}</h1>
        <div className="page-sub">
          {profile.lessonsPassed === 0
            ? 'Nothing cleared yet. Start anywhere — the first chapter of every track is open.'
            : `${profile.lessonsPassed} of ${profile.lessonsTotal} lessons cleared, ${profile.xp.toLocaleString()} XP earned.`}
        </div>
      </div>

      {firstRun && (
        <div className="card onboarding" style={{ marginBottom: 16 }}>
          <div className="card-title">How this works</div>
          <ol className="stack-sm">
            <li>
              Every lesson is graded by <strong>running your code</strong> — real TypeScript, real Postgres, a
              real HTTP server. There is nothing to memorise and nothing to type back.
            </li>
            <li>
              <strong>Run</strong> is free and shows you exactly which graders fail. <strong>Submit</strong> scores.
              A pass with no hints earns a 20% clean bonus; each hint costs a little; revealing the solution caps
              the reward at 20%.
            </li>
            <li>
              The headline number is <strong>mid-level readiness</strong> — weighted completion across all six
              tracks. Start with whichever track you know least.
            </li>
          </ol>
        </div>
      )}

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="hero">
            <LevelRing level={profile.level} pct={profile.levelPct} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div className="rank">{profile.rank}</div>
              <div className="rank-note">{profile.rankNote}</div>
              <div style={{ marginTop: 12 }}>
                <Bar pct={profile.levelPct} label="Progress to next level" />
                <div className="quest-meta" style={{ marginTop: 5 }}>
                  {profile.levelInto} / {profile.levelNeed} XP to level {profile.level + 1}
                </div>
              </div>
              {profile.nextRank && (
                <div className="rank-next">
                  Next rank: <strong>{profile.nextRank.title}</strong> — needs {profile.nextRank.needs}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Mid-level readiness</div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <div className="stat-value accent" style={{ fontSize: 34 }}>
              {profile.readiness}%
            </div>
            <div className="muted" style={{ textAlign: 'right', fontSize: 12.5 }}>
              weighted across
              <br />
              all six tracks
            </div>
          </div>
          <Bar pct={profile.readiness} label="Mid-level readiness" />
          <div className="grid cols-3" style={{ marginTop: 18, gap: 12 }}>
            <Stat
              value={profile.streak.current}
              label="day streak"
              hint={profile.streak.atRisk ? 'at risk — clear one today' : `best ${profile.streak.longest}`}
            />
            <Stat
              value={profile.xpFromLessons.toLocaleString()}
              label="lesson XP"
              hint={`+${profile.xpFromMeta.toLocaleString()} from badges & quests`}
            />
            <Stat value={`${profile.achievementsEarned}/${profile.achievementsTotal}`} label="badges" />
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Continue</div>
          {nextUp ? (
            <div>
              <div style={{ fontSize: 17, fontWeight: 620, marginBottom: 3 }}>{nextUp.title}</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 15 }}>{nextUp.track}</div>
              <LinkButton href={`#/lesson/${nextUp.id}`} primary>
                Open lesson →
              </LinkButton>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 17, fontWeight: 620, marginBottom: 6 }}>Everything unlocked is cleared. 🎖</div>
              <div className="muted" style={{ fontSize: 13 }}>
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
              <a key={track.id} href={`#/track/${track.id}`} className="track-mini">
                <div className="row" style={{ marginBottom: 8 }}>
                  <div className="track-badge" style={{ background: `${track.color}22`, color: track.color }} aria-hidden>
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
                <Bar pct={pct} tone={pct === 100 ? 'pass' : undefined} label={`${track.title} progress`} />
              </a>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recent activity</div>
        <Timeline entries={history} limit={12} />
      </div>
    </div>
  );
}

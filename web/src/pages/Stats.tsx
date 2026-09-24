import { useState } from 'react';
import { api, type AppState } from '../api.ts';
import { Bar, Confirm, Stat, Timeline } from '../components/bits.tsx';

export function Stats({ state, onReset }: { state: AppState; onReset: () => void }) {
  const { profile, tracks, days, history } = state;
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trackById = Object.fromEntries(tracks.map((t) => [t.id, t]));
  const activeDays = Object.keys(days).length;
  const totalDayXp = Object.values(days).reduce((sum, day) => sum + day.xp, 0);
  const passRate = profile.stats.submits ? Math.round((profile.stats.passes / profile.stats.submits) * 100) : 0;

  const reset = async () => {
    setConfirming(false);
    setResetting(true);
    setError(null);
    try {
      await api.reset();
      onReset();
      window.location.hash = '#/';
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Stats</h1>
        <div className="page-sub">
          Started {new Date(profile.createdAt).toLocaleDateString()} · everything below lives in
          <kbd className="kbd" style={{ margin: '0 4px' }}>data/progress.json</kbd>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Overall</div>
        <div className="grid cols-4">
          <Stat value={profile.xp.toLocaleString()} label="total XP" hint={`of ${profile.xpAvailable.toLocaleString()} in lessons`} />
          <Stat value={profile.level} label="level" hint={profile.rank} />
          <Stat value={`${profile.lessonsPassed}/${profile.lessonsTotal}`} label="lessons cleared" />
          <Stat value={`${profile.readiness}%`} label="mid-level readiness" />
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Per track</div>
          {profile.trackReadiness.map((entry) => {
            const track = trackById[entry.trackId];
            if (!track) return null;
            return (
              <div key={entry.trackId} style={{ marginBottom: 14 }}>
                <div className="row between" style={{ fontSize: 13, marginBottom: 5 }}>
                  <span>
                    <span style={{ color: track.color, marginRight: 7 }} aria-hidden>
                      {track.icon}
                    </span>
                    {track.title}
                  </span>
                  <span className="faint tabular">
                    {entry.passed}/{entry.total}
                  </span>
                </div>
                <Bar pct={entry.pct} tone={entry.pct === 100 ? 'pass' : undefined} label={`${track.title} progress`} />
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="card-title">Habits</div>
          <div className="grid cols-2" style={{ gap: 16, marginBottom: 18 }}>
            <Stat value={profile.streak.current} label="current streak" hint={`best ${profile.streak.longest} days`} />
            <Stat value={profile.streak.freezes} label="streak freezes" hint="one per 5-day streak, max 3" />
            <Stat value={activeDays} label="active days" hint={`${totalDayXp.toLocaleString()} XP across them`} />
            <Stat value={`${passRate}%`} label="submit pass rate" hint={`${profile.stats.passes}/${profile.stats.submits} submits`} />
          </div>
          <div className="card-title" style={{ marginBottom: 8 }}>Last 8 weeks</div>
          <Heatmap days={days} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Effort</div>
        <div className="grid cols-4">
          <Stat value={profile.stats.submits} label="submissions" />
          <Stat value={profile.stats.hintsOpened} label="hints opened" />
          <Stat value={`${(profile.stats.sandboxMs / 1000).toFixed(1)}s`} label="sandbox time" hint="total time your code has spent running" />
          <Stat value={profile.xpFromMeta.toLocaleString()} label="bonus XP" hint="from badges and daily quests" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Recent history{history.length ? ` · last ${history.length}` : ''}</div>
        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          <Timeline entries={history} showKind />
        </div>
      </div>

      <div className="card">
        <div className="card-title">Danger zone</div>
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="muted" style={{ fontSize: 13, maxWidth: 520 }}>
            Reset wipes XP, levels, streaks, achievements and every saved draft. The curriculum itself is untouched —
            it lives in <kbd className="kbd">content/</kbd>.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn ghost" href={api.exportUrl} download>
              Export progress
            </a>
            <button className="danger" onClick={() => setConfirming(true)} disabled={resetting}>
              {resetting ? 'Resetting…' : 'Reset all progress'}
            </button>
          </div>
        </div>
        {error && <div className="inline-error">{error}</div>}
      </div>

      <Confirm
        open={confirming}
        title="Reset all progress?"
        body={
          <p>
            This erases <strong>everything</strong>: XP, level, streak, achievements, quest progress and every draft.
            There is no undo.
          </p>
        }
        confirmLabel="Erase everything"
        danger
        onConfirm={reset}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function Heatmap({ days }: { days: Record<string, { lessons: number; xp: number }> }) {
  const today = new Date();
  const cells: { key: string; xp: number }[] = [];
  for (let i = 55; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const key = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    cells.push({ key, xp: days[key]?.xp ?? 0 });
  }
  const level = (xp: number) => (xp === 0 ? '' : xp < 60 ? ' l1' : xp < 150 ? ' l2' : xp < 350 ? ' l3' : ' l4');

  return (
    <div className="heat" role="img" aria-label="Activity over the last eight weeks">
      {cells.map((cell) => (
        <div key={cell.key} className={`heat-day${level(cell.xp)}`} title={`${cell.key}: ${cell.xp} XP`} />
      ))}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api, type AppState } from './api.ts';
import { Dashboard } from './pages/Dashboard.tsx';
import { TrackMap } from './pages/TrackMap.tsx';
import { LessonView } from './pages/Lesson.tsx';
import { Achievements } from './pages/Achievements.tsx';
import { Stats } from './pages/Stats.tsx';

/** Hash routing: no dependency, and a lesson URL survives a reload. */
type Route =
  | { name: 'dashboard' }
  | { name: 'tracks'; trackId?: string }
  | { name: 'lesson'; id: string }
  | { name: 'achievements' }
  | { name: 'stats' };

function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (path[0] === 'lesson' && path[1]) return { name: 'lesson', id: path[1] };
  if (path[0] === 'track') return { name: 'tracks', trackId: path[1] };
  if (path[0] === 'tracks') return { name: 'tracks' };
  if (path[0] === 'achievements') return { name: 'achievements' };
  if (path[0] === 'stats') return { name: 'stats' };
  return { name: 'dashboard' };
}

export const go = (to: string) => {
  window.location.hash = to;
};

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-read progress whenever we land back on a summary screen, so XP earned in
  // a lesson is reflected without a manual reload.
  useEffect(() => {
    if (route.name !== 'lesson') void refresh();
  }, [route.name, refresh]);

  if (error) {
    return (
      <div className="loading">
        <p><strong>Cannot reach the local API.</strong></p>
        <p style={{ color: 'var(--text-dim)' }}>{error}</p>
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>
          Is the server running? Start both halves with <span className="kbd">npm run dev</span>.
        </p>
      </div>
    );
  }

  if (!state) return <div className="loading">Loading your progress…</div>;

  return (
    <div className="shell">
      <Sidebar state={state} route={route} />
      <div className="main">
        {route.name === 'dashboard' && <Dashboard state={state} />}
        {route.name === 'tracks' && <TrackMap state={state} trackId={route.trackId} />}
        {route.name === 'lesson' && <LessonView id={route.id} onProgress={refresh} />}
        {route.name === 'achievements' && <Achievements state={state} />}
        {route.name === 'stats' && <Stats state={state} onReset={refresh} />}
      </div>
    </div>
  );
}

function Sidebar({ state, route }: { state: AppState; route: Route }) {
  const { profile } = state;
  const item = (href: string, icon: string, label: string, active: boolean, count?: string) => (
    <a className={`nav-item${active ? ' active' : ''}`} href={href}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      {count && <span className="nav-count">{count}</span>}
    </a>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-name">bootlocalopus</div>
        <div className="brand-sub">junior → mid, locally</div>
      </div>

      <div className="nav">
        {item('#/', '◆', 'Dashboard', route.name === 'dashboard')}
        {item(
          '#/tracks',
          '⬢',
          'Tracks',
          route.name === 'tracks' || route.name === 'lesson',
          `${profile.lessonsPassed}/${profile.lessonsTotal}`,
        )}
        {item(
          '#/achievements',
          '★',
          'Achievements',
          route.name === 'achievements',
          `${profile.achievementsEarned}/${profile.achievementsTotal}`,
        )}
        {item('#/stats', '▤', 'Stats', route.name === 'stats')}
      </div>

      <div className="nav">
        <div className="nav-section">Tracks</div>
        {state.tracks.map((track) => (
          <a
            key={track.id}
            className={`nav-item${route.name === 'tracks' && route.trackId === track.id ? ' active' : ''}`}
            href={`#/track/${track.id}`}
          >
            <span className="nav-icon" style={{ color: track.color }}>
              {track.icon}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {track.title.split(' ')[0]}
            </span>
            <span className="nav-count">
              {track.passed}/{track.total}
            </span>
          </a>
        ))}
      </div>

      <div style={{ marginTop: 'auto' }}>
        <div className="row between" style={{ marginBottom: 5, fontSize: 12 }}>
          <span style={{ color: 'var(--text-faint)' }}>Mid-level readiness</span>
          <strong style={{ color: 'var(--accent)' }}>{profile.readiness}%</strong>
        </div>
        <Progress pct={profile.readiness} />
        <div className="row" style={{ marginTop: 12, gap: 6 }}>
          <span className="pill accent">Lv {profile.level}</span>
          {profile.streak.current > 0 && <span className="pill">🔥 {profile.streak.current}</span>}
          {profile.combo > 0 && <span className="pill pass">×{profile.combo} combo</span>}
        </div>
      </div>
    </aside>
  );
}

function Progress({ pct }: { pct: number }) {
  return (
    <div className="bar">
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

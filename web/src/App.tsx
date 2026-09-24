import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiUnavailable, type AppState, type Profile } from './api.ts';
import { Bar, useDocumentTitle } from './components/bits.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { TrackMap } from './pages/TrackMap.tsx';
import { LessonView } from './pages/Lesson.tsx';
import { Achievements } from './pages/Achievements.tsx';
import { Stats } from './pages/Stats.tsx';

/** Hash routing: no dependency, and a lesson URL survives a reload. */
export type Route =
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

const TITLES: Record<Route['name'], string> = {
  dashboard: 'Dashboard',
  tracks: 'Tracks',
  lesson: 'Lesson',
  achievements: 'Achievements',
  stats: 'Stats',
};

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** The track the open lesson belongs to, so the sidebar can highlight it. */
  const [lessonTrack, setLessonTrack] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // A stale response must never overwrite a newer one, so each refresh takes
  // a ticket and only the latest ticket may write.
  const ticket = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++ticket.current;
    setRefreshing(true);
    try {
      const next = await api.state();
      if (mine !== ticket.current) return;
      setState(next);
      setError(null);
    } catch (e) {
      if (mine !== ticket.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === ticket.current) setRefreshing(false);
    }
  }, []);

  /** Cheap update from a submit response, so the sidebar moves without a round trip. */
  const patchProfile = useCallback((profile: Profile) => {
    setState((current) => (current ? { ...current, profile } : current));
  }, []);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      setMenuOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Always load on mount — including a cold load of a `#/lesson/...` URL, which
  // the route effect below deliberately skips.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Whenever we land on a summary screen after that, refresh so XP earned in a
  // lesson is reflected without a manual reload. The first run is covered by
  // the mount fetch; the ticket guard keeps the latest response authoritative.
  const firstRoute = useRef(true);
  useEffect(() => {
    const first = firstRoute.current;
    firstRoute.current = false;
    if (route.name === 'lesson') return;
    setLessonTrack(null);
    if (!first) void refresh();
  }, [route, refresh]);

  useDocumentTitle(route.name === 'lesson' ? '' : TITLES[route.name]);

  if (!state) {
    if (error) {
      return (
        <div className="loading" role="alert">
          <p>
            <strong>Cannot reach the local API.</strong>
          </p>
          <p className="muted">{error}</p>
          <p className="faint" style={{ fontSize: 13 }}>
            Is the server running? Start both halves with <kbd className="kbd">npm run dev</kbd>, or
            everything at once with <kbd className="kbd">npm start</kbd>.
          </p>
          <button className="primary" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      );
    }
    return <div className="loading">Loading your progress…</div>;
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <button
        className="menu-toggle ghost"
        aria-expanded={menuOpen}
        aria-controls="sidebar"
        onClick={() => setMenuOpen((o) => !o)}
      >
        ☰ <span>Menu</span>
      </button>
      <Sidebar state={state} route={route} lessonTrack={lessonTrack} open={menuOpen} />
      <main className="main" id="main">
        {error && (
          <div className="banner fail refresh-error" role="alert">
            <span aria-hidden>⚠</span>
            <div>
              Could not refresh your progress: {error}{' '}
              <button className="ghost small" onClick={() => void refresh()} disabled={refreshing}>
                Retry
              </button>
            </div>
          </div>
        )}
        {route.name === 'dashboard' && <Dashboard state={state} />}
        {route.name === 'tracks' && <TrackMap state={state} trackId={route.trackId} />}
        {route.name === 'lesson' && (
          <LessonView
            id={route.id}
            onProgress={refresh}
            onProfile={patchProfile}
            onTrack={setLessonTrack}
          />
        )}
        {route.name === 'achievements' && <Achievements state={state} />}
        {route.name === 'stats' && <Stats state={state} onReset={refresh} />}
      </main>
    </div>
  );
}

function Sidebar({
  state,
  route,
  lessonTrack,
  open,
}: {
  state: AppState;
  route: Route;
  lessonTrack: string | null;
  open: boolean;
}) {
  const { profile } = state;
  const activeTrack = route.name === 'tracks' ? route.trackId : lessonTrack;

  const item = (href: string, icon: string, label: string, active: boolean, count?: string) => (
    <a className={`nav-item${active ? ' active' : ''}`} href={href} aria-current={active ? 'page' : undefined}>
      <span className="nav-icon" aria-hidden>{icon}</span>
      <span>{label}</span>
      {count && <span className="nav-count">{count}</span>}
    </a>
  );

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} id="sidebar">
      <div className="brand">
        <div className="brand-name">bootlocalopus</div>
        <div className="brand-sub">junior → mid, locally</div>
      </div>

      <nav className="nav" aria-label="Main">
        {item('#/', '◆', 'Dashboard', route.name === 'dashboard')}
        {item(
          '#/tracks',
          '⬢',
          'Tracks',
          route.name === 'tracks' && !route.trackId,
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
      </nav>

      <nav className="nav" aria-label="Tracks">
        <div className="nav-section">Tracks</div>
        {state.tracks.map((track) => {
          const active = activeTrack === track.id;
          return (
            <a
              key={track.id}
              className={`nav-item${active ? ' active' : ''}`}
              href={`#/track/${track.id}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="nav-icon" style={{ color: track.color }} aria-hidden>
                {track.icon}
              </span>
              <span className="nav-label">{track.short}</span>
              <span className="nav-count">
                {track.passed}/{track.total}
              </span>
            </a>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <div className="row between" style={{ marginBottom: 5, fontSize: 12 }}>
          <span className="faint">Mid-level readiness</span>
          <strong className="accent">{profile.readiness}%</strong>
        </div>
        <Bar pct={profile.readiness} label="Mid-level readiness" />
        <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>
          <span className="pill accent">Lv {profile.level}</span>
          {profile.streak.current > 0 && (
            <span className="pill" title={profile.streak.atRisk ? 'A freeze will be spent unless you clear a lesson today' : undefined}>
              🔥 {profile.streak.current}{profile.streak.atRisk ? ' ⚠' : ''}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

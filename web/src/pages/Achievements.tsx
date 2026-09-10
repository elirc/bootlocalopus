import { useState } from 'react';
import type { AppState } from '../api.ts';
import { Bar } from '../components/bits.tsx';

export function Achievements({ state }: { state: AppState }) {
  const [filter, setFilter] = useState<'all' | 'earned' | 'locked'>('all');
  const { achievements, profile } = state;

  const visible = achievements.filter((a) => {
    if (filter === 'earned') return !!a.earnedAt;
    if (filter === 'locked') return !a.earnedAt;
    return true;
  });

  const earnedXp = achievements
    .filter((a) => a.earnedAt)
    .reduce((sum, a) => sum + a.xp, 0);
  const totalXp = achievements.reduce((sum, a) => sum + a.xp, 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Achievements</h1>
        <div className="page-sub">
          {profile.achievementsEarned} of {profile.achievementsTotal} earned ·{' '}
          {earnedXp.toLocaleString()} of {totalXp.toLocaleString()} bonus XP claimed
        </div>
        <div style={{ maxWidth: 420, marginTop: 12 }}>
          <Bar pct={(profile.achievementsEarned / profile.achievementsTotal) * 100} />
        </div>
      </div>

      <div className="tabs">
        {(['all', 'earned', 'locked'] as const).map((key) => (
          <div key={key} className={`tab${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
            {key === 'all' ? 'All' : key === 'earned' ? 'Earned' : 'Locked'}
          </div>
        ))}
      </div>

      <div className="grid cols-2">
        {visible.map((achievement) => {
          const earned = !!achievement.earnedAt;
          const hidden = achievement.secret && !earned;
          return (
            <div key={achievement.id} className={`ach ${earned ? 'earned' : 'locked'}`}>
              <div className="ach-icon">{hidden ? '❔' : achievement.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row between">
                  <div className="ach-title">{hidden ? 'Secret achievement' : achievement.title}</div>
                  <span className={`pill${earned ? ' accent' : ''}`}>+{achievement.xp}</span>
                </div>
                <div className="ach-detail">
                  {hidden ? 'Do something unusual to find this one.' : achievement.detail}
                </div>
                {earned ? (
                  <div className="ach-when">
                    Earned {new Date(achievement.earnedAt!).toLocaleDateString()}
                  </div>
                ) : achievement.eligible ? (
                  <div className="ach-when" style={{ color: 'var(--accent)' }}>
                    Conditions met — clear a lesson to claim it
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {visible.length === 0 && <div className="empty">Nothing here yet.</div>}
    </div>
  );
}

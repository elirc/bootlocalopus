import type { LessonDetail, Rewards } from '../../api.ts';
import { LinkButton, Modal } from '../../components/bits.tsx';

export function RewardCard({
  rewards,
  lesson,
  open,
  onClose,
}: {
  rewards: Rewards;
  lesson: LessonDetail;
  open: boolean;
  onClose: () => void;
}) {
  const xp = rewards.xp;
  const total = (xp?.total ?? 0) + rewards.questXp + rewards.achievementXp;
  const nextOpen = lesson.next?.unlocked;

  return (
    <Modal open={open} onClose={onClose} title={lesson.boss ? 'Boss defeated' : 'Lesson cleared'}>
      <div className="reward">
        <div className="reward-head">
          <div className="reward-eyebrow">{lesson.boss ? 'Boss defeated' : 'Lesson cleared'}</div>
          <div className="reward-xp">+{total}</div>
          <div className="reward-title">XP earned</div>
        </div>

        {xp && (
          <dl className="reward-lines">
            <Line label="Base" value={xp.base} />
            {xp.hintPenalty > 0 && <Line label="Hints used" value={-xp.hintPenalty} tone="penalty" />}
            {xp.solutionPenalty > 0 && <Line label="Solution revealed" value={-xp.solutionPenalty} tone="penalty" />}
            {xp.cleanBonus > 0 && <Line label="Clean — no hints, no reveal" value={xp.cleanBonus} tone="bonus" />}
            {rewards.questXp > 0 && <Line label="Daily quests" value={rewards.questXp} tone="bonus" />}
            {rewards.achievementXp > 0 && <Line label="Achievements" value={rewards.achievementXp} tone="bonus" />}
          </dl>
        )}

        {rewards.rankedUp && (
          <div className="reward-banner">
            <div className="reward-banner-title">Rank up: {rewards.rankedUp.title}</div>
            <div className="reward-banner-sub">{rewards.rankedUp.note}</div>
          </div>
        )}
        {rewards.leveledUp && !rewards.rankedUp && (
          <div className="reward-banner">
            <div className="reward-banner-title">Level {rewards.leveledUp.to}</div>
            <div className="reward-banner-sub">Up from level {rewards.leveledUp.from}</div>
          </div>
        )}

        {rewards.streak.current > 1 && (
          <div className="reward-line" style={{ marginTop: 12 }}>
            <span>🔥 Streak</span>
            <span className="value">
              {rewards.streak.current} days
              {rewards.streak.freezesUsed > 0 ? ` (${rewards.streak.freezesUsed} freeze${rewards.streak.freezesUsed === 1 ? '' : 's'} used)` : ''}
            </span>
          </div>
        )}

        {rewards.questsFinished.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="card-title" style={{ marginBottom: 6 }}>Quests completed</div>
            {rewards.questsFinished.map((quest) => (
              <div className="reward-line bonus" key={quest.id}>
                <span>◆ {quest.label}</span>
                <span className="value">+{quest.xp}</span>
              </div>
            ))}
          </div>
        )}

        {rewards.newAchievements.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="card-title" style={{ marginBottom: 4 }}>New achievements</div>
            {rewards.newAchievements.map((badge) => (
              <div className="badge-row" key={badge.id}>
                <span className="badge-icon" aria-hidden>{badge.icon}</span>
                <div style={{ flex: 1 }}>
                  <div className="badge-title">{badge.title}</div>
                  <div className="badge-detail">{badge.detail}</div>
                </div>
                <span className="pill accent">+{badge.xp}</span>
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 22, gap: 8 }}>
          {lesson.next && nextOpen ? (
            <LinkButton href={`#/lesson/${lesson.next.id}`} primary onClick={onClose} style={{ flex: 1 }} initialFocus>
              Next: {lesson.next.title} →
            </LinkButton>
          ) : (
            <LinkButton href={`#/track/${lesson.track.id}`} primary onClick={onClose} style={{ flex: 1 }} initialFocus>
              Back to {lesson.track.title}
            </LinkButton>
          )}
          <button className="ghost" onClick={onClose}>
            Stay here
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Line({ label, value, tone }: { label: string; value: number; tone?: 'bonus' | 'penalty' }) {
  return (
    <div className={`reward-line${tone ? ' ' + tone : ''}`}>
      <dt>{label}</dt>
      <dd className="value">
        {value > 0 ? '+' : ''}
        {value}
      </dd>
    </div>
  );
}

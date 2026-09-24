/**
 * Everything that mutates progress when something is earned. Three entry
 * points, all synchronous once called, so a route that awaits grading and then
 * calls one of these cannot interleave with another request.
 */
import type { Rewards } from '../web/src/api.ts';
import * as store from './progress.ts';
import type { Progress } from './progress.ts';
import { locate, questFeasibility } from './content.ts';
import { ACHIEVEMENTS, bumpStreak, computeXp, dayKey, levelFromXp, rankFor, type Quest } from './gamify.ts';
import { buildCtx, rankInput } from './projections.ts';

/** Roll the quest board if the calendar day changed. Cheap; call at the top of every route. */
export function ensureDay(p: Progress, now = new Date()) {
  return store.ensureDay(p, dayKey(now), questFeasibility(p));
}

/**
 * Recompute quest progress from today's counters, mark finished ones and pay
 * them. The only place `done` is set, so a quest can never be marked done
 * without being paid.
 */
export function awardQuests(p: Progress, now = new Date()): Quest[] {
  const day = store.today(p, dayKey(now));
  const finished: Quest[] = [];
  for (const q of p.daily.quests) {
    const value =
      q.metric === 'lessons' ? day.lessons
      : q.metric === 'xp' ? day.xp
      : q.metric === 'clean' ? day.clean
      : q.metric === 'boss' ? day.bosses
      : (q.kinds ?? []).reduce((s, k) => s + (day.kinds[k] ?? 0), 0);
    q.progress = Math.min(value, q.goal);
    if (!q.done && value >= q.goal) {
      q.done = true;
      p.xp += q.xp;
      p.xpFromMeta += q.xp;
      day.xp += q.xp;
      store.log(p, { kind: 'quest', label: q.label, xp: q.xp }, now.toISOString());
      finished.push(q);
    }
  }
  return finished;
}

/**
 * Award every achievement whose condition holds and which has not been paid.
 * Idempotent, so it is safe to run after load() as well as after every pass —
 * a badge whose condition was met by an older build is paid on the next start.
 */
export function reconcileAchievements(p: Progress, now = new Date()) {
  const ctx = buildCtx(p);
  const awarded: { id: string; title: string; detail: string; icon: string; xp: number }[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id] || !a.earned(ctx)) continue;
    p.achievements[a.id] = now.toISOString();
    p.xp += a.xp;
    p.xpFromMeta += a.xp;
    store.today(p, dayKey(now)).xp += a.xp;
    store.log(p, { kind: 'achievement', label: a.title, xp: a.xp }, now.toISOString());
    awarded.push({ id: a.id, title: a.title, detail: a.detail, icon: a.icon, xp: a.xp });
  }
  return awarded;
}

/** Everything that happens the moment a lesson goes green. */
export function applyPass(p: Progress, lessonId: string, now = new Date()): Rewards {
  const loc = locate(lessonId)!;
  const rec = store.record(p, lessonId, !!loc.lesson.boss);
  const levelBefore = levelFromXp(p.xp).level;
  const rankBefore = rankFor(rankInput(p)).rank.title;
  const ts = now.toISOString();

  const breakdown = computeXp({
    base: loc.lesson.xp,
    hintsUsed: rec.hintsUsed,
    hintCount: loc.lesson.hints?.length ?? 0,
    solutionRevealed: rec.solutionRevealed,
  });

  rec.status = 'passed';
  rec.solvedAt = ts;
  rec.lastTouchedAt = ts;
  rec.xpAwarded = breakdown.total;
  rec.boss = !!loc.lesson.boss;
  // Frozen: hints opened after passing must never change what this was worth.
  rec.pass = { attempts: rec.attempts, hintsUsed: rec.hintsUsed, solutionRevealed: rec.solutionRevealed, at: ts };

  p.xp += breakdown.total;
  p.xpFromLessons += breakdown.total;
  p.stats.passes++;

  const day = store.today(p, dayKey(now));
  day.lessons++;
  day.xp += breakdown.total;
  if (breakdown.cleanBonus > 0) day.clean++;
  if (loc.lesson.boss) day.bosses++;
  day.kinds[loc.lesson.kind] = (day.kinds[loc.lesson.kind] ?? 0) + 1;

  const streak = bumpStreak(p, dayKey(now));
  store.log(p, { kind: 'pass', lessonId, label: loc.lesson.title, xp: breakdown.total }, ts);

  const questsFinished = awardQuests(p, now);
  const newAchievements = reconcileAchievements(p, now);

  const levelAfter = levelFromXp(p.xp).level;
  if (levelAfter > levelBefore) {
    store.log(p, { kind: 'levelup', label: `Level ${levelAfter}` }, ts);
  }
  const rankAfter = rankFor(rankInput(p)).rank;
  if (rankAfter.title !== rankBefore) {
    store.log(p, { kind: 'levelup', label: `Rank up — ${rankAfter.title}` }, ts);
  }

  return {
    xp: breakdown,
    questXp: questsFinished.reduce((s, q) => s + q.xp, 0),
    achievementXp: newAchievements.reduce((s, a) => s + a.xp, 0),
    leveledUp: levelAfter > levelBefore ? { from: levelBefore, to: levelAfter } : null,
    rankedUp: rankAfter.title !== rankBefore ? { title: rankAfter.title, note: rankAfter.note } : null,
    newAchievements,
    questsFinished: questsFinished.map((q) => ({ id: q.id, label: q.label, xp: q.xp })),
    streak: { current: p.streak.current, freezesUsed: streak.freezesUsed, longest: p.streak.longest },
  };
}

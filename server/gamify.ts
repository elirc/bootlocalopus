/**
 * The game layer: levels, ranks, XP economics, streaks, daily quests and
 * achievements. Pure functions over a Progress snapshot so the rules stay
 * testable (see gamify.test.ts) and the server stays boring.
 *
 * Economy in one paragraph: a lesson pays its base XP, minus a share for each
 * hint opened (all hints together always cost half), times 1.2 if it was
 * solved with no hints and no reveal. Revealing the solution caps the pay at
 * 20%. There is no first-try bonus and no combo — both rewarded guessing on
 * the free Run button rather than understanding. Ranks are earned by
 * completion milestones, not XP, so bonus XP from badges and quests cannot
 * promote anyone past what they have actually cleared.
 */
import type { Progress, LessonRecord } from './progress.ts';
import type { Track } from '../content/types.ts';

/* -------------------------------------------------------------- levels */

/** XP needed to go from `level` to `level + 1`. Gently superlinear. */
export const xpForNextLevel = (level: number) => 100 + 50 * (level - 1);

export function levelFromXp(xp: number) {
  let level = 1;
  let spent = 0;
  while (xp - spent >= xpForNextLevel(level) && level < 99) {
    spent += xpForNextLevel(level);
    level++;
  }
  const need = xpForNextLevel(level);
  return { level, into: xp - spent, need, pct: Math.round(((xp - spent) / need) * 100) };
}

/* --------------------------------------------------------------- ranks */

export interface RankInput {
  /** Lessons passed / total, 0..1. */
  fraction: number;
  bossesBeaten: number;
  bossesTotal: number;
  /** Number of tracks with at least one boss beaten. */
  tracksWithBoss: number;
  /** Every track at >= 50% passed. */
  everyTrackHalf: boolean;
}

export interface Rank {
  title: string;
  note: string;
  /** Human requirement, shown as "Next rank: X — needs …". */
  needs: string;
  reached: (r: RankInput) => boolean;
}

export const RANKS: Rank[] = [
  { title: 'Junior I', note: 'Ships small changes with review', needs: 'start', reached: () => true },
  { title: 'Junior II', note: 'Owns a feature end to end', needs: '10% of lessons', reached: (r) => r.fraction >= 0.10 },
  { title: 'Junior III', note: 'Debugs without hand-holding', needs: '25% of lessons', reached: (r) => r.fraction >= 0.25 },
  { title: 'Mid-Track', note: 'Trusted with the tricky ticket', needs: '40% of lessons and a boss beaten',
    reached: (r) => r.fraction >= 0.40 && r.bossesBeaten >= 1 },
  { title: 'Mid I', note: 'Designs before coding', needs: '55% of lessons and bosses in 3 tracks',
    reached: (r) => r.fraction >= 0.55 && r.tracksWithBoss >= 3 },
  { title: 'Mid II', note: 'Reviews others, spots the sharp edges', needs: '70% of lessons and every track at 50%',
    reached: (r) => r.fraction >= 0.70 && r.everyTrackHalf },
  { title: 'Mid III', note: 'Owns a service and its on-call', needs: '85% of lessons and every boss beaten',
    reached: (r) => r.fraction >= 0.85 && r.bossesBeaten >= r.bossesTotal },
  { title: 'Mid-Level', note: 'The whole curriculum, cleared', needs: '100% of lessons', reached: (r) => r.fraction >= 1 },
];

/** Ranks are cumulative: you hold the highest rank whose every predecessor you also meet. */
export function rankFor(input: RankInput) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (RANKS[i].reached(input)) index = i;
    else break;
  }
  const rank = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  return { rank, next, index };
}

/* ----------------------------------------------------------- XP economics */

export const CLEAN_BONUS = 0.2;
export const HINT_SHARE = 0.5;          // all hints together cost this share of base
export const SOLUTION_MULTIPLIER = 0.2;

export interface XpBreakdown {
  base: number;
  hintPenalty: number;
  cleanBonus: number;
  solutionPenalty: number;
  total: number;
}

/** What one hint costs on a lesson, in XP. Every hint costs the same. */
export const hintCost = (base: number, hintCount: number) =>
  hintCount > 0 ? Math.round((base * HINT_SHARE) / hintCount) : 0;

export function computeXp(opts: {
  base: number;
  hintsUsed: number;
  hintCount: number;
  solutionRevealed: boolean;
}): XpBreakdown {
  const { base, hintCount, solutionRevealed } = opts;
  const hintsUsed = Math.min(opts.hintsUsed, hintCount);

  if (solutionRevealed) {
    const total = Math.round(base * SOLUTION_MULTIPLIER);
    return { base, hintPenalty: 0, cleanBonus: 0, solutionPenalty: base - total, total };
  }

  const hintMult = hintCount > 0 ? 1 - hintsUsed * (HINT_SHARE / hintCount) : 1;
  const afterHints = base * hintMult;
  const clean = hintsUsed === 0;
  const total = Math.round(afterHints * (clean ? 1 + CLEAN_BONUS : 1));

  return {
    base,
    hintPenalty: Math.round(base - afterHints),
    cleanBonus: clean ? total - base : 0,
    solutionPenalty: 0,
    total,
  };
}

/* --------------------------------------------------------------- streaks */

export const dayKey = (d = new Date()) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

/** Whole days between two day keys, in local calendar terms. */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86_400_000);

export const MAX_FREEZES = 3;
export const FREEZE_EVERY = 5;

/**
 * Called once per completed lesson. A gap of k missed days is covered when
 * k <= freezes, consuming k of them; a bigger gap resets the streak.
 */
export function bumpStreak(p: Progress, today = dayKey()) {
  const s = p.streak;
  if (s.lastDay && today <= s.lastDay) return { changed: false, freezesUsed: 0 };

  let freezesUsed = 0;
  if (!s.lastDay) {
    s.current = 1;
  } else {
    const gap = daysBetween(s.lastDay, today) - 1;   // days with no activity in between
    if (gap === 0) {
      s.current += 1;
    } else if (gap <= s.freezes) {
      s.freezes -= gap;
      freezesUsed = gap;
      s.current += 1;
    } else {
      s.current = 1;
    }
  }
  s.lastDay = today;
  s.longest = Math.max(s.longest, s.current);
  if (s.current % FREEZE_EVERY === 0) s.freezes = Math.min(MAX_FREEZES, s.freezes + 1);
  return { changed: true, freezesUsed };
}

/** The streak as it stands right now, without a pass to bump it. */
export function effectiveStreak(p: Progress, today = dayKey()) {
  const s = p.streak;
  if (!s.lastDay || s.current === 0) return { current: 0, atRisk: false, freezes: s.freezes };
  const gap = daysBetween(s.lastDay, today) - 1;
  if (gap < 0) return { current: s.current, atRisk: false, freezes: s.freezes };
  if (gap === 0) return { current: s.current, atRisk: false, freezes: s.freezes };
  if (gap <= s.freezes) return { current: s.current, atRisk: true, freezes: s.freezes };
  return { current: 0, atRisk: false, freezes: s.freezes };
}

/* ----------------------------------------------------------- daily quests */

export interface Quest {
  id: string;
  label: string;
  metric: 'lessons' | 'xp' | 'clean' | 'boss' | 'kind';
  kinds?: string[];
  goal: number;
  progress: number;
  xp: number;
  done: boolean;
}

export type QuestTemplate = Omit<Quest, 'progress' | 'done'>;

export const QUEST_POOL: QuestTemplate[] = [
  { id: 'grind-2', label: 'Complete 2 lessons', metric: 'lessons', goal: 2, xp: 15 },
  { id: 'grind-4', label: 'Complete 4 lessons', metric: 'lessons', goal: 4, xp: 35 },
  { id: 'xp-150', label: 'Earn 150 XP', metric: 'xp', goal: 150, xp: 20 },
  { id: 'xp-300', label: 'Earn 300 XP', metric: 'xp', goal: 300, xp: 40 },
  { id: 'clean-2', label: 'Clear 2 lessons with no hints', metric: 'clean', goal: 2, xp: 25 },
  { id: 'boss-1', label: 'Beat a boss', metric: 'boss', goal: 1, xp: 50 },
  { id: 'sql-2', label: 'Solve 2 Postgres lessons', metric: 'kind', kinds: ['sql'], goal: 2, xp: 25 },
  { id: 'react-2', label: 'Solve 2 React lessons', metric: 'kind', kinds: ['react'], goal: 2, xp: 25 },
  { id: 'types-2', label: 'Solve 2 TypeScript lessons', metric: 'kind', kinds: ['typecheck', 'ts'], goal: 2, xp: 25 },
  { id: 'node-2', label: 'Solve 2 Node lessons', metric: 'kind', kinds: ['node'], goal: 2, xp: 25 },
  { id: 'tests-2', label: 'Write the tests for 2 lessons', metric: 'kind', kinds: ['mutation'], goal: 2, xp: 30 },
];

/** Deterministic per-day pick so refreshing the page cannot reroll the board. */
function seededPick<T>(items: T[], count: number, seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    const idx = Math.abs(h) % pool.length;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * What the learner can actually reach today, so the board never asks for two
 * SQL lessons when only one is unlocked. `reachable` counts unpassed lessons
 * in the unlock frontier (plus the one behind it) per kind, and unpassed
 * bosses in unlocked chapters.
 */
export interface QuestFeasibility {
  unpassedByKind: Record<string, number>;
  unpassedTotal: number;
  bossReachable: boolean;
}

export function rollDailyQuests(day = dayKey(), feasible?: QuestFeasibility): Quest[] {
  const ok = (q: QuestTemplate) => {
    if (!feasible) return true;
    if (q.metric === 'lessons') return feasible.unpassedTotal >= q.goal;
    if (q.metric === 'clean') return feasible.unpassedTotal >= q.goal;
    if (q.metric === 'boss') return feasible.bossReachable;
    if (q.metric === 'kind') {
      const n = (q.kinds ?? []).reduce((s, k) => s + (feasible.unpassedByKind[k] ?? 0), 0);
      return n >= q.goal;
    }
    return true;
  };
  const volume = seededPick(QUEST_POOL.filter((q) => q.metric === 'lessons' && ok(q)), 1, day + 'v');
  const rest = seededPick(QUEST_POOL.filter((q) => q.metric !== 'lessons' && ok(q)), 2, day);
  return [...volume, ...rest].map((q) => ({ ...q, progress: 0, done: false }));
}

/* ------------------------------------------------------------ achievements */

export interface AchievementDef {
  id: string;
  title: string;
  detail: string;
  icon: string;
  xp: number;
  secret?: boolean;
  earned: (ctx: AchievementCtx) => boolean;
}

export interface AchievementCtx {
  p: Progress;
  tracks: Track[];
  /** Passed records whose lesson still exists in the curriculum. */
  passed: LessonRecord[];
  totalLessons: number;
  trackOf: Map<string, string>;
  kindOf: Map<string, string>;
  /** chapterId -> completion, using the frozen pass snapshot for cleanliness. */
  chapters: Map<string, { total: number; passed: number; allClean: boolean }>;
}

const countKind = (ctx: AchievementCtx, kinds: string[]) =>
  ctx.passed.filter((r) => kinds.includes(ctx.kindOf.get(r.id) ?? '')).length;

const trackComplete = (ctx: AchievementCtx, trackId: string) => {
  const track = ctx.tracks.find((t) => t.id === trackId);
  if (!track) return false;
  const ids = track.chapters.flatMap((c) => c.lessons.map((l) => l.id));
  return ids.length > 0 && ids.every((id) => ctx.p.lessons[id]?.status === 'passed');
};

/** A pass is clean if, at the moment it happened, no hint and no reveal had been used. */
export const isClean = (r: LessonRecord) =>
  r.pass ? r.pass.hintsUsed === 0 && !r.pass.solutionRevealed : r.hintsUsed === 0 && !r.solutionRevealed;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-blood', title: 'First Blood', detail: 'Clear your first lesson', icon: '🩸', xp: 10,
    earned: (c) => c.passed.length >= 1 },
  { id: 'ten-down', title: 'Warming Up', detail: 'Clear 10 lessons', icon: '🔥', xp: 25,
    earned: (c) => c.passed.length >= 10 },
  { id: 'twenty-five', title: 'Regular', detail: 'Clear 25 lessons', icon: '💪', xp: 40,
    earned: (c) => c.passed.length >= 25 },
  { id: 'fifty', title: 'Committed', detail: 'Clear 50 lessons', icon: '🏗️', xp: 60,
    earned: (c) => c.passed.length >= 50 },
  { id: 'hundred', title: 'Centurion', detail: 'Clear 100 lessons', icon: '🏛️', xp: 90,
    earned: (c) => c.passed.length >= 100 },
  { id: 'chapter-clear', title: 'Chapter Closed', detail: 'Finish every lesson in a chapter', icon: '📕', xp: 30,
    earned: (c) => [...c.chapters.values()].some((ch) => ch.total > 0 && ch.passed === ch.total) },
  { id: 'flawless', title: 'Flawless', detail: 'Finish a whole chapter with no hints and no reveals', icon: '💎', xp: 75,
    earned: (c) => [...c.chapters.values()].some((ch) => ch.total > 1 && ch.passed === ch.total && ch.allClean) },
  { id: 'boss-slayer', title: 'Boss Slayer', detail: 'Beat 3 bosses', icon: '⚔️', xp: 50,
    earned: (c) => c.passed.filter((r) => r.boss).length >= 3 },
  { id: 'no-net', title: 'No Safety Net', detail: 'Clear 15 lessons without opening a hint', icon: '🎯', xp: 50,
    earned: (c) => c.passed.filter(isClean).length >= 15 },
  { id: 'comeback', title: 'Comeback', detail: 'Pass a lesson after 5 or more failed attempts', icon: '🧱', xp: 30,
    earned: (c) => c.passed.some((r) => (r.pass?.attempts ?? r.attempts) >= 6) },
  { id: 'streak-3', title: 'Three in a Row', detail: 'A 3-day streak', icon: '📅', xp: 15,
    earned: (c) => c.p.streak.longest >= 3 },
  { id: 'streak-7', title: 'Week Solid', detail: 'A 7-day streak', icon: '🗓️', xp: 35,
    earned: (c) => c.p.streak.longest >= 7 },
  { id: 'streak-30', title: 'Unbroken', detail: 'A 30-day streak', icon: '🏆', xp: 100,
    earned: (c) => c.p.streak.longest >= 30 },
  { id: 'sql-slinger', title: 'SQL Slinger', detail: 'Solve 10 Postgres lessons', icon: '🐘', xp: 40,
    earned: (c) => countKind(c, ['sql']) >= 10 },
  { id: 'type-wizard', title: 'Type Wizard', detail: 'Solve 8 TypeScript lessons', icon: '🧙', xp: 40,
    earned: (c) => countKind(c, ['typecheck', 'ts']) >= 8 },
  { id: 'hook-smith', title: 'Hook Smith', detail: 'Solve 10 React lessons', icon: '⚛️', xp: 40,
    earned: (c) => countKind(c, ['react']) >= 10 },
  { id: 'server-side', title: 'Server Side', detail: 'Solve 10 Node lessons', icon: '🟢', xp: 40,
    earned: (c) => countKind(c, ['node']) >= 10 },
  { id: 'test-writer', title: 'Test Writer', detail: 'Write the tests for 5 lessons', icon: '🧪', xp: 40,
    earned: (c) => countKind(c, ['mutation']) >= 5 },
  { id: 'track-js', title: 'JavaScript, Actually Understood', detail: 'Complete the JavaScript track', icon: '🟨', xp: 80,
    earned: (c) => trackComplete(c, 'js') },
  { id: 'track-ts', title: 'Types Tamed', detail: 'Complete the TypeScript track', icon: '🔷', xp: 80,
    earned: (c) => trackComplete(c, 'ts') },
  { id: 'track-react', title: 'React Renderer', detail: 'Complete the React track', icon: '⚛️', xp: 80,
    earned: (c) => trackComplete(c, 'react') },
  { id: 'track-node', title: 'Backend Builder', detail: 'Complete the Node track', icon: '🟩', xp: 80,
    earned: (c) => trackComplete(c, 'node') },
  { id: 'track-sql', title: 'Data Modeller', detail: 'Complete the Postgres track', icon: '🐘', xp: 80,
    earned: (c) => trackComplete(c, 'sql') },
  { id: 'track-testing', title: 'Trust but Verify', detail: 'Complete the Testing & Quality track', icon: '🧪', xp: 80,
    earned: (c) => trackComplete(c, 'testing') },
  { id: 'track-craft', title: 'Engineer, Not Coder', detail: 'Complete the Engineering Craft track', icon: '🛠️', xp: 80,
    earned: (c) => trackComplete(c, 'craft') },
  { id: 'mid-level', title: 'Mid-Level', detail: 'Clear every lesson in the curriculum', icon: '🎖️', xp: 250,
    earned: (c) => c.totalLessons > 0 && c.passed.length >= c.totalLessons },
  { id: 'night-shift', title: 'Night Shift', detail: 'Clear a lesson between 1am and 5am', icon: '🦉', xp: 10, secret: true,
    earned: (c) => c.passed.some((r) => {
      const at = r.pass?.at ?? r.solvedAt;
      const h = at ? new Date(at).getHours() : -1;
      return h >= 1 && h < 5;
    }) },
];

export const ACHIEVEMENT_XP_TOTAL = ACHIEVEMENTS.reduce((s, a) => s + a.xp, 0);

/* -------------------------------------------------------------- readiness */

export interface TrackReadiness {
  trackId: string;
  passed: number;
  total: number;
  pct: number;
}

export function readiness(tracks: Track[], p: Progress) {
  const per: TrackReadiness[] = tracks.map((t) => {
    const ids = t.chapters.flatMap((c) => c.lessons.map((l) => l.id));
    const passed = ids.filter((id) => p.lessons[id]?.status === 'passed').length;
    return { trackId: t.id, passed, total: ids.length, pct: ids.length ? Math.round((passed / ids.length) * 100) : 0 };
  });
  const weightSum = tracks.reduce((s, t) => s + (t.weight ?? 1), 0) || 1;
  // Weighted mean of exact fractions; only the final number is rounded.
  const overall = Math.round(
    (tracks.reduce((s, t, i) => s + (t.weight ?? 1) * (per[i].total ? per[i].passed / per[i].total : 0), 0) / weightSum) * 100,
  );
  return { per, overall };
}

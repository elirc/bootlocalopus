/**
 * The game layer: levels, ranks, XP economics, streaks, daily quests and
 * achievements. Pure functions over a Progress snapshot so the rules stay
 * testable and the server stays boring.
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

const RANKS: { min: number; title: string; note: string }[] = [
  { min: 1, title: 'Junior I', note: 'Ships small changes with review' },
  { min: 3, title: 'Junior II', note: 'Owns a feature end to end' },
  { min: 5, title: 'Junior III', note: 'Debugs without hand-holding' },
  { min: 8, title: 'Mid-Track', note: 'Trusted with the tricky ticket' },
  { min: 11, title: 'Mid I', note: 'Designs before coding' },
  { min: 14, title: 'Mid II', note: 'Reviews others, spots the sharp edges' },
  { min: 18, title: 'Mid III', note: 'Owns a service and its on-call' },
  { min: 22, title: 'Senior-Track', note: 'Sets the pattern others follow' },
];

export const rankFor = (level: number) =>
  [...RANKS].reverse().find((r) => level >= r.min) ?? RANKS[0];

/* ----------------------------------------------------------- XP economics */

export const HINT_PENALTY = 0.12;     // per hint revealed, of base XP
export const MIN_HINT_MULTIPLIER = 0.5;
export const SOLUTION_MULTIPLIER = 0.2;
export const FIRST_TRY_BONUS = 0.25;
export const MAX_COMBO = 5;

/** Combo grows with consecutive first-try passes and resets on a failure. */
export const comboMultiplier = (combo: number) => 1 + Math.min(combo, MAX_COMBO) * 0.05;

export interface XpBreakdown {
  base: number;
  hintPenalty: number;
  firstTryBonus: number;
  comboBonus: number;
  solutionPenalty: number;
  total: number;
  combo: number;
}

export function computeXp(opts: {
  base: number;
  attempts: number;      // attempts INCLUDING the passing one
  hintsUsed: number;
  solutionRevealed: boolean;
  combo: number;         // combo streak before this lesson
}): XpBreakdown {
  const { base, attempts, hintsUsed, solutionRevealed } = opts;

  if (solutionRevealed) {
    const total = Math.round(base * SOLUTION_MULTIPLIER);
    return { base, hintPenalty: base - total, firstTryBonus: 0, comboBonus: 0,
             solutionPenalty: base - total, total, combo: 0 };
  }

  const hintMult = Math.max(MIN_HINT_MULTIPLIER, 1 - hintsUsed * HINT_PENALTY);
  const afterHints = base * hintMult;
  const hintPenalty = Math.round(base - afterHints);

  const firstTry = attempts <= 1;
  const firstTryBonus = firstTry ? Math.round(afterHints * FIRST_TRY_BONUS) : 0;
  const combo = firstTry ? opts.combo + 1 : 0;
  const comboBonus = firstTry ? Math.round(afterHints * (comboMultiplier(opts.combo) - 1)) : 0;

  return {
    base,
    hintPenalty,
    firstTryBonus,
    comboBonus,
    solutionPenalty: 0,
    total: Math.round(afterHints) + firstTryBonus + comboBonus,
    combo,
  };
}

/* --------------------------------------------------------------- streaks */

export const dayKey = (d = new Date()) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

const dayBefore = (key: string, n = 1) => {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

/**
 * Called once per completed lesson. A gap of exactly one day burns a freeze if
 * the learner has one, which keeps the streak alive without lying about it.
 */
export function bumpStreak(p: Progress, today = dayKey()) {
  const s = p.streak;
  if (s.lastDay === today) return { changed: false, usedFreeze: false };

  let usedFreeze = false;
  if (!s.lastDay) {
    s.current = 1;
  } else if (s.lastDay === dayBefore(today)) {
    s.current += 1;
  } else if (s.lastDay === dayBefore(today, 2) && s.freezes > 0) {
    s.freezes -= 1;
    s.current += 1;
    usedFreeze = true;
  } else {
    s.current = 1;
  }
  s.lastDay = today;
  s.longest = Math.max(s.longest, s.current);
  // One freeze earned every 5 days of streak, capped.
  if (s.current % 5 === 0) s.freezes = Math.min(3, s.freezes + 1);
  return { changed: true, usedFreeze };
}

/* ----------------------------------------------------------- daily quests */

export interface Quest {
  id: string;
  label: string;
  metric: 'lessons' | 'xp' | 'firstTry' | 'boss' | 'noHints' | 'kind';
  kind?: string;
  goal: number;
  progress: number;
  xp: number;
  done: boolean;
}

const QUEST_POOL: Omit<Quest, 'progress' | 'done'>[] = [
  { id: 'grind-2', label: 'Complete 2 lessons', metric: 'lessons', goal: 2, xp: 40 },
  { id: 'grind-4', label: 'Complete 4 lessons', metric: 'lessons', goal: 4, xp: 90 },
  { id: 'xp-150', label: 'Earn 150 XP', metric: 'xp', goal: 150, xp: 50 },
  { id: 'xp-300', label: 'Earn 300 XP', metric: 'xp', goal: 300, xp: 110 },
  { id: 'clean-2', label: 'Pass 2 lessons on the first try', metric: 'firstTry', goal: 2, xp: 70 },
  { id: 'nohint-3', label: 'Clear 3 lessons without hints', metric: 'noHints', goal: 3, xp: 80 },
  { id: 'boss-1', label: 'Beat a boss', metric: 'boss', goal: 1, xp: 120 },
  { id: 'sql-2', label: 'Solve 2 SQL lessons', metric: 'kind', kind: 'sql', goal: 2, xp: 70 },
  { id: 'react-2', label: 'Solve 2 React lessons', metric: 'kind', kind: 'react', goal: 2, xp: 70 },
  { id: 'types-2', label: 'Solve 2 TypeScript lessons', metric: 'kind', kind: 'typecheck', goal: 2, xp: 70 },
];

/** Deterministic per-day pick so refreshing the page can't reroll the board. */
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

export function rollDailyQuests(day = dayKey()): Quest[] {
  // Always one "volume" quest plus two others, so a board is never all-or-nothing.
  const volume = seededPick(QUEST_POOL.filter((q) => q.metric === 'lessons'), 1, day + 'v');
  const rest = seededPick(QUEST_POOL.filter((q) => q.metric !== 'lessons'), 2, day);
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
  passed: LessonRecord[];
  totalLessons: number;
  /** lessonId -> track id, for track-scoped achievements. */
  trackOf: Map<string, string>;
  kindOf: Map<string, string>;
  /** Chapter completion, chapterId -> { total, passed, allFirstTry }. */
  chapters: Map<string, { total: number; passed: number; allFirstTry: boolean }>;
}

const countKind = (ctx: AchievementCtx, kind: string) =>
  ctx.passed.filter((r) => ctx.kindOf.get(r.id) === kind).length;

const trackComplete = (ctx: AchievementCtx, trackId: string) => {
  const track = ctx.tracks.find((t) => t.id === trackId);
  if (!track) return false;
  const ids = track.chapters.flatMap((c) => c.lessons.map((l) => l.id));
  return ids.length > 0 && ids.every((id) => ctx.p.lessons[id]?.status === 'passed');
};

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-blood', title: 'First Blood', detail: 'Clear your first lesson', icon: '🩸', xp: 25,
    earned: (c) => c.passed.length >= 1 },
  { id: 'ten-down', title: 'Warming Up', detail: 'Clear 10 lessons', icon: '🔥', xp: 60,
    earned: (c) => c.passed.length >= 10 },
  { id: 'twenty-five', title: 'Regular', detail: 'Clear 25 lessons', icon: '💪', xp: 120,
    earned: (c) => c.passed.length >= 25 },
  { id: 'fifty', title: 'Committed', detail: 'Clear 50 lessons', icon: '🏗️', xp: 250,
    earned: (c) => c.passed.length >= 50 },
  { id: 'chapter-clear', title: 'Chapter Closed', detail: 'Finish every lesson in a chapter', icon: '📕', xp: 80,
    earned: (c) => [...c.chapters.values()].some((ch) => ch.total > 0 && ch.passed === ch.total) },
  { id: 'flawless', title: 'Flawless', detail: 'Finish a whole chapter with every lesson passing first try', icon: '💎', xp: 200,
    earned: (c) => [...c.chapters.values()].some((ch) => ch.total > 1 && ch.passed === ch.total && ch.allFirstTry) },
  { id: 'boss-slayer', title: 'Boss Slayer', detail: 'Beat 3 bosses', icon: '⚔️', xp: 150,
    earned: (c) => c.passed.filter((r) => r.boss).length >= 3 },
  { id: 'no-net', title: 'No Safety Net', detail: 'Clear 15 lessons without opening a hint', icon: '🎯', xp: 130,
    earned: (c) => c.passed.filter((r) => r.hintsUsed === 0 && !r.solutionRevealed).length >= 15 },
  { id: 'comeback', title: 'Comeback', detail: 'Pass a lesson after 5 or more failed attempts', icon: '🧱', xp: 60,
    earned: (c) => c.passed.some((r) => r.attempts >= 6) },
  { id: 'streak-3', title: 'Three in a Row', detail: 'A 3-day streak', icon: '📅', xp: 50,
    earned: (c) => c.p.streak.longest >= 3 },
  { id: 'streak-7', title: 'Week Solid', detail: 'A 7-day streak', icon: '🗓️', xp: 140,
    earned: (c) => c.p.streak.longest >= 7 },
  { id: 'streak-30', title: 'Unbroken', detail: 'A 30-day streak', icon: '🏆', xp: 500,
    earned: (c) => c.p.streak.longest >= 30 },
  { id: 'sql-slinger', title: 'SQL Slinger', detail: 'Solve 10 Postgres lessons', icon: '🐘', xp: 120,
    earned: (c) => countKind(c, 'sql') >= 10 },
  { id: 'type-wizard', title: 'Type Wizard', detail: 'Solve 8 compiler-graded type lessons', icon: '🧙', xp: 120,
    earned: (c) => countKind(c, 'typecheck') >= 8 },
  { id: 'hook-smith', title: 'Hook Smith', detail: 'Solve 10 React lessons', icon: '⚛️', xp: 120,
    earned: (c) => countKind(c, 'react') >= 10 },
  { id: 'server-side', title: 'Server Side', detail: 'Solve 10 Node lessons', icon: '🟢', xp: 120,
    earned: (c) => countKind(c, 'node') >= 10 },
  { id: 'track-js', title: 'JavaScript, Actually Understood', detail: 'Complete the JavaScript track', icon: '🟨', xp: 300,
    earned: (c) => trackComplete(c, 'js') },
  { id: 'track-ts', title: 'Types Tamed', detail: 'Complete the TypeScript track', icon: '🔷', xp: 300,
    earned: (c) => trackComplete(c, 'ts') },
  { id: 'track-react', title: 'React Renderer', detail: 'Complete the React track', icon: '⚛️', xp: 300,
    earned: (c) => trackComplete(c, 'react') },
  { id: 'track-node', title: 'Backend Builder', detail: 'Complete the Node track', icon: '🟩', xp: 300,
    earned: (c) => trackComplete(c, 'node') },
  { id: 'track-sql', title: 'Data Modeler', detail: 'Complete the Postgres track', icon: '🐘', xp: 300,
    earned: (c) => trackComplete(c, 'sql') },
  { id: 'track-craft', title: 'Engineer, Not Coder', detail: 'Complete the Engineering Craft track', icon: '🛠️', xp: 300,
    earned: (c) => trackComplete(c, 'craft') },
  { id: 'mid-level', title: 'Mid-Level', detail: 'Reach 100% readiness across every track', icon: '🎖️', xp: 1000,
    earned: (c) => c.totalLessons > 0 && c.passed.length === c.totalLessons },
  { id: 'night-shift', title: 'Night Shift', detail: 'Clear a lesson between 1am and 5am', icon: '🦉', xp: 40, secret: true,
    earned: (c) => c.passed.some((r) => {
      const h = r.solvedAt ? new Date(r.solvedAt).getHours() : -1;
      return h >= 1 && h < 5;
    }) },
];

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
  const weightSum = tracks.reduce((s, t) => s + t.weight, 0) || 1;
  const overall = Math.round(
    tracks.reduce((s, t, i) => s + t.weight * (per[i].pct / 100), 0) / weightSum * 100,
  );
  return { per, overall };
}

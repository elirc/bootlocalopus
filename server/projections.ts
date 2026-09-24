/**
 * Read-only views of progress for the client. Everything here is a pure
 * function of (curriculum, Progress); nothing mutates.
 *
 * The return types are the wire types the web app imports, so a drift
 * between the two halves fails `tsc` rather than a learner's session.
 */
import type {
  AppState, Achievement, ChapterSummary, LessonDetail, LessonLink, LessonSummary,
  Profile, TrackSummary,
} from '../web/src/api.ts';
import type { Progress } from './progress.ts';
import {
  tracks, locate, lessonUnlocked, lockReason, chapterUnlocked, chapterStats, chapterMap,
  nextUp, totalLessons, totalXp, trackOf, kindOf, bosses, type Located,
} from './content.ts';
import {
  ACHIEVEMENTS, computeXp, effectiveStreak, levelFromXp, rankFor, readiness, type AchievementCtx,
} from './gamify.ts';

/* ------------------------------------------------------------- achievement ctx */

export function buildCtx(p: Progress): AchievementCtx {
  return {
    p,
    tracks,
    // Only records whose lesson still exists: editing the curriculum must not
    // strand a badge or award one for a lesson that was removed.
    passed: Object.values(p.lessons).filter((r) => r.status === 'passed' && locate(r.id)),
    totalLessons,
    trackOf,
    kindOf: kindOf as Map<string, string>,
    chapters: chapterMap(p),
  };
}

/* --------------------------------------------------------------------- rank */

export function rankInput(p: Progress) {
  const passedIds = Object.values(p.lessons).filter((r) => r.status === 'passed' && locate(r.id)).map((r) => r.id);
  const all = bosses();
  const beaten = all.filter((b) => passedIds.includes(b.lesson.id));
  const tracksWithBoss = new Set(beaten.map((b) => b.track.id)).size;
  const everyTrackHalf = tracks.every((t) => {
    const ids = t.chapters.flatMap((c) => c.lessons.map((l) => l.id));
    if (!ids.length) return true;
    return ids.filter((id) => passedIds.includes(id)).length / ids.length >= 0.5;
  });
  return {
    fraction: totalLessons ? passedIds.length / totalLessons : 0,
    bossesBeaten: beaten.length,
    bossesTotal: all.length,
    tracksWithBoss,
    everyTrackHalf,
  };
}

/* ------------------------------------------------------------------ profile */

export function profile(p: Progress, now = new Date()): Profile {
  const lv = levelFromXp(p.xp);
  const { rank, next } = rankFor(rankInput(p));
  const ready = readiness(tracks, p);
  const streak = effectiveStreak(p, dayKeyOf(now));
  const passedCount = Object.values(p.lessons).filter((r) => r.status === 'passed' && locate(r.id)).length;
  return {
    xp: p.xp,
    xpFromLessons: p.xpFromLessons,
    xpFromMeta: p.xpFromMeta,
    level: lv.level,
    levelInto: lv.into,
    levelNeed: lv.need,
    levelPct: lv.pct,
    rank: rank.title,
    rankNote: rank.note,
    nextRank: next ? { title: next.title, needs: next.needs } : null,
    streak: {
      current: streak.current,
      longest: p.streak.longest,
      lastDay: p.streak.lastDay,
      freezes: streak.freezes,
      atRisk: streak.atRisk,
    },
    readiness: ready.overall,
    trackReadiness: ready.per,
    lessonsPassed: passedCount,
    lessonsTotal: totalLessons,
    xpAvailable: totalXp,
    achievementsEarned: Object.keys(p.achievements).filter((id) => ACHIEVEMENTS.some((a) => a.id === id)).length,
    achievementsTotal: ACHIEVEMENTS.length,
    stats: p.stats,
    createdAt: p.createdAt,
  };
}

function dayKeyOf(d: Date) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ achievements */

export function achievementBoard(p: Progress): Achievement[] {
  const ctx = buildCtx(p);
  return ACHIEVEMENTS.map((a) => {
    const earnedAt = p.achievements[a.id] ?? null;
    // Unearned secrets stay secret on the wire, not just in the UI.
    if (a.secret && !earnedAt) {
      return { id: a.id, title: 'Secret achievement', detail: 'Do something unusual to find this one.',
               icon: '❔', xp: a.xp, secret: true, earnedAt: null, eligible: false };
    }
    return {
      id: a.id, title: a.title, detail: a.detail, icon: a.icon, xp: a.xp, secret: !!a.secret,
      earnedAt,
      eligible: !earnedAt && a.earned(ctx),
    };
  });
}

/* ------------------------------------------------------------------ tracks */

const SHORT: Record<string, string> = {
  js: 'JavaScript', ts: 'TypeScript', react: 'React', node: 'Node', sql: 'Postgres',
  testing: 'Testing', craft: 'Craft',
};

export function trackTree(p: Progress): TrackSummary[] {
  return tracks.map((track) => {
    const chapters: ChapterSummary[] = track.chapters.map((chapter, ci) => {
      const stats = chapterStats(chapter, p);
      return {
        id: chapter.id,
        title: chapter.title,
        summary: chapter.summary,
        unlocked: chapterUnlocked(track, ci, p),
        passed: stats.passed,
        total: stats.total,
        lessons: chapter.lessons.map((l): LessonSummary => {
          const rec = p.lessons[l.id];
          return {
            id: l.id,
            title: l.title,
            kind: l.kind,
            xp: l.xp,
            boss: !!l.boss,
            why: l.why,
            status: rec?.status ?? 'new',
            clean: rec?.status === 'passed' ? (rec.pass ? rec.pass.hintsUsed === 0 && !rec.pass.solutionRevealed : false) : false,
            hintsUsed: rec?.hintsUsed ?? 0,
            xpAwarded: rec?.xpAwarded ?? 0,
            unlocked: lessonUnlocked(l.id, p),
          };
        }),
      };
    });
    const ids = track.chapters.flatMap((c) => c.lessons.map((l) => l.id));
    return {
      id: track.id,
      title: track.title,
      short: track.short ?? SHORT[track.id] ?? track.title.split(' ')[0],
      icon: track.icon,
      color: track.color,
      blurb: track.blurb,
      total: ids.length,
      passed: ids.filter((id) => p.lessons[id]?.status === 'passed').length,
      chapters,
    };
  });
}

/* ------------------------------------------------------------------- state */

export function appState(p: Progress, now = new Date()): AppState {
  const next = nextUp(p, now);
  return {
    profile: profile(p, now),
    tracks: trackTree(p),
    quests: p.daily.quests.map((q) => ({ id: q.id, label: q.label, goal: q.goal, progress: q.progress, xp: q.xp, done: q.done })),
    achievements: achievementBoard(p),
    history: p.history.slice(0, 40),
    days: Object.fromEntries(Object.entries(p.days).map(([k, v]) => [k, { lessons: v.lessons, xp: v.xp }])),
    nextUp: next ? { id: next.lesson.id, title: next.lesson.title, track: next.track.title } : null,
  };
}

/* ------------------------------------------------------------------ lesson */

/** What a pass is worth right now, for the pill next to the title. */
export function xpAtStake(loc: Located, p: Progress) {
  const rec = p.lessons[loc.lesson.id];
  return computeXp({
    base: loc.lesson.xp,
    hintsUsed: rec?.hintsUsed ?? 0,
    hintCount: loc.lesson.hints?.length ?? 0,
    solutionRevealed: rec?.solutionRevealed ?? false,
  }).total;
}

function link(loc: Located | undefined, p: Progress): LessonLink | undefined {
  if (!loc) return undefined;
  return { id: loc.lesson.id, title: loc.lesson.title, unlocked: lessonUnlocked(loc.lesson.id, p) };
}

/** The neighbours, crossing chapter boundaries within the track. */
function neighbours(loc: Located) {
  const flat = loc.track.chapters.flatMap((c) => c.lessons.map((l) => l.id));
  const at = flat.indexOf(loc.lesson.id);
  return { prev: locate(flat[at - 1] ?? ''), next: locate(flat[at + 1] ?? '') };
}

/** The lesson's neighbours as links, with `unlocked` computed against the current progress. */
export function lessonLinks(loc: Located, p: Progress): { next: LessonLink | undefined; prev: LessonLink | undefined } {
  const { prev, next } = neighbours(loc);
  return { next: link(next, p), prev: link(prev, p) };
}

/** Lesson shape sent to the browser: no reference solution unless revealed, no graders, no answers. */
export function publicLesson(loc: Located, p: Progress): LessonDetail {
  const { lesson } = loc;
  const rec = p.lessons[lesson.id];
  const unlocked = lessonUnlocked(lesson.id, p);
  const links = lessonLinks(loc, p);
  const revealed = !!rec?.solutionRevealed;
  return {
    id: lesson.id,
    title: lesson.title,
    kind: lesson.kind,
    xp: lesson.xp,
    boss: !!lesson.boss,
    why: lesson.why,
    brief: lesson.brief,
    tags: lesson.tags ?? [],
    starter: rec?.draft ?? lesson.starter ?? '',
    pristineStarter: lesson.starter ?? '',
    hintCount: lesson.hints?.length ?? 0,
    hintCost: hintCostOf(loc),
    hints: (lesson.hints ?? []).slice(0, rec?.hintsUsed ?? 0),
    hasSolution: !!lesson.solution,
    solution: revealed ? lesson.solution : undefined,
    solutionRevealed: revealed,
    quiz: lesson.quiz?.map((q) => ({ q: q.q, options: q.options, multi: q.answer.length > 1 })),
    fixtures: lesson.kind === 'sql' || lesson.kind === 'node-db' ? lesson.fixtures : undefined,
    subject: lesson.kind === 'mutation' ? lesson.subject : undefined,
    track: { id: loc.track.id, title: loc.track.title, color: loc.track.color, icon: loc.track.icon },
    chapter: { id: loc.chapter.id, title: loc.chapter.title },
    status: rec?.status ?? 'new',
    attempts: rec?.attempts ?? 0,
    hintsUsed: rec?.hintsUsed ?? 0,
    xpAwarded: rec?.xpAwarded ?? 0,
    xpAtStake: xpAtStake(loc, p),
    unlocked,
    lockReason: unlocked ? undefined : lockReason(lesson.id, p),
    next: links.next,
    prev: links.prev,
  };
}

export function hintCostOf(loc: Located) {
  const count = loc.lesson.hints?.length ?? 0;
  return count ? Math.round((loc.lesson.xp * 0.5) / count) : 0;
}

/**
 * Loads the curriculum and answers structural questions about it: what is
 * unlocked and why, what comes next, how a lesson maps to its chapter/track.
 */
import { tracks } from '../content/index.ts';
import type { Chapter, Lesson, Track } from '../content/types.ts';
import type { Progress } from './progress.ts';
import { isClean, type QuestFeasibility } from './gamify.ts';

export { tracks };

export interface Located {
  lesson: Lesson;
  chapter: Chapter;
  track: Track;
  /** Index within the chapter. */
  index: number;
  chapterIndex: number;
}

const index = new Map<string, Located>();
const order: string[] = [];

for (const track of tracks) {
  track.chapters.forEach((chapter, chapterIndex) => {
    chapter.lessons.forEach((lesson, i) => {
      if (index.has(lesson.id)) {
        throw new Error(`Duplicate lesson id "${lesson.id}" (${track.id}/${chapter.id})`);
      }
      index.set(lesson.id, { lesson, chapter, track, index: i, chapterIndex });
      order.push(lesson.id);
    });
  });
}

export const locate = (id: string) => index.get(id);
export const allLessons = () => order.map((id) => index.get(id)!);
export const totalLessons = order.length;
export const totalXp = order.reduce((s, id) => s + index.get(id)!.lesson.xp, 0);
export const bosses = () => allLessons().filter((l) => l.lesson.boss);

export const trackOf = new Map(order.map((id) => [id, index.get(id)!.track.id]));
export const kindOf = new Map(order.map((id) => [id, index.get(id)!.lesson.kind]));

const passed = (p: Progress, id: string) => p.lessons[id]?.status === 'passed';

/* ------------------------------------------------------------------ unlock */

/**
 * "All but one": a chapter opens when at most one lesson of the previous
 * chapter is still unpassed, and a lesson opens when at most one lesson
 * before it in its chapter is unpassed. One lesson you bounce off never walls
 * off the rest; skipping two does. Bosses are skippable for unlocking but are
 * still required for the track badge and the Mid-Level rank.
 */
export function chapterUnlocked(track: Track, chapterIdx: number, p: Progress): boolean {
  if (chapterIdx === 0) return true;
  const prev = track.chapters[chapterIdx - 1];
  if (prev.lessons.length === 0) return true;
  const unpassed = prev.lessons.filter((l) => !passed(p, l.id)).length;
  return unpassed <= 1;
}

export function lessonUnlocked(id: string, p: Progress): boolean {
  const loc = index.get(id);
  if (!loc) return false;
  if (!chapterUnlocked(loc.track, loc.chapterIndex, p)) return false;
  const before = loc.chapter.lessons.slice(0, loc.index);
  return before.filter((l) => !passed(p, l.id)).length <= 1;
}

/** Why a lesson is locked, in the learner's terms. Undefined when it is open. */
export function lockReason(id: string, p: Progress): string | undefined {
  const loc = index.get(id);
  if (!loc) return 'This lesson does not exist.';
  if (!chapterUnlocked(loc.track, loc.chapterIndex, p)) {
    const prev = loc.track.chapters[loc.chapterIndex - 1];
    const unpassed = prev.lessons.filter((l) => !passed(p, l.id)).length;
    return `"${prev.title}" opens this chapter once all but one of its lessons are cleared (${unpassed} still open).`;
  }
  const before = loc.chapter.lessons.slice(0, loc.index).filter((l) => !passed(p, l.id));
  if (before.length > 1) {
    return `Clear ${before.length - 1} more of the lessons before this one in "${loc.chapter.title}" (you may skip one).`;
  }
  return undefined;
}

/* --------------------------------------------------------------- chapters */

export function chapterStats(chapter: Chapter, p: Progress) {
  const total = chapter.lessons.length;
  const done = chapter.lessons.filter((l) => passed(p, l.id)).length;
  const allClean = chapter.lessons.every((l) => {
    const rec = p.lessons[l.id];
    return rec?.status === 'passed' && isClean(rec);
  });
  return { total, passed: done, allClean };
}

export function chapterMap(p: Progress) {
  const m = new Map<string, { total: number; passed: number; allClean: boolean }>();
  for (const track of tracks) {
    for (const chapter of track.chapters) m.set(chapter.id, chapterStats(chapter, p));
  }
  return m;
}

/* ----------------------------------------------------------------- nextUp */

const HOURS_48 = 48 * 3_600_000;

/**
 * The lesson the dashboard's big "Continue" button should point at:
 * whatever the learner touched most recently (within two days), else the
 * lesson after their latest pass in the same track, else the first open one.
 */
export function nextUp(p: Progress, now = new Date()): Located | undefined {
  const open = (id: string) => !passed(p, id) && lessonUnlocked(id, p);

  let recent: { id: string; at: number } | null = null;
  for (const rec of Object.values(p.lessons)) {
    if (rec.status === 'passed' || !rec.lastTouchedAt || !open(rec.id)) continue;
    const at = Date.parse(rec.lastTouchedAt);
    if (now.getTime() - at <= HOURS_48 && (!recent || at > recent.at)) recent = { id: rec.id, at };
  }
  if (recent) return index.get(recent.id);

  let latestPass: { id: string; at: number } | null = null;
  for (const rec of Object.values(p.lessons)) {
    if (rec.status !== 'passed' || !index.has(rec.id)) continue;
    const at = Date.parse(rec.pass?.at ?? rec.solvedAt ?? '') || 0;
    if (!latestPass || at > latestPass.at) latestPass = { id: rec.id, at };
  }
  if (latestPass) {
    const track = index.get(latestPass.id)!.track;
    const inTrack = track.chapters.flatMap((c) => c.lessons.map((l) => l.id));
    const after = inTrack.find(open);
    if (after) return index.get(after);
  }

  return index.get(order.find(open) ?? '');
}

/* -------------------------------------------------------- quest feasibility */

/** What the learner can reach today: the unlock frontier plus one lesson past it. */
export function questFeasibility(p: Progress): QuestFeasibility {
  const unpassedByKind: Record<string, number> = {};
  let unpassedTotal = 0;
  let bossReachable = false;

  for (const track of tracks) {
    track.chapters.forEach((chapter, ci) => {
      if (!chapterUnlocked(track, ci, p)) return;
      let openSlots = 2;   // the frontier lesson and the one behind it
      for (const lesson of chapter.lessons) {
        if (passed(p, lesson.id)) continue;
        if (openSlots === 0) break;
        openSlots--;
        unpassedTotal++;
        unpassedByKind[lesson.kind] = (unpassedByKind[lesson.kind] ?? 0) + 1;
        if (lesson.boss) bossReachable = true;
      }
    });
  }
  return { unpassedByKind, unpassedTotal, bossReachable };
}

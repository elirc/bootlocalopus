/**
 * Loads the curriculum and answers structural questions about it: what is
 * unlocked, what comes next, how a lesson maps back to its chapter and track.
 */
import { tracks } from '../content/index.ts';
import type { Chapter, Lesson, Track } from '../content/types.ts';
import type { Progress } from './progress.ts';

export { tracks };

export interface Located {
  lesson: Lesson;
  chapter: Chapter;
  track: Track;
  /** Index within the chapter. */
  index: number;
}

const index = new Map<string, Located>();
const order: string[] = [];

for (const track of tracks) {
  for (const chapter of track.chapters) {
    chapter.lessons.forEach((lesson, i) => {
      if (index.has(lesson.id)) {
        throw new Error(`Duplicate lesson id "${lesson.id}" (${track.id}/${chapter.id})`);
      }
      index.set(lesson.id, { lesson, chapter, track, index: i });
      order.push(lesson.id);
    });
  }
}

export const locate = (id: string) => index.get(id);
export const allLessons = () => order.map((id) => index.get(id)!);
export const totalLessons = order.length;
export const totalXp = order.reduce((s, id) => s + index.get(id)!.lesson.xp, 0);

export const trackOf = new Map(order.map((id) => [id, index.get(id)!.track.id]));
export const kindOf = new Map(order.map((id) => [id, index.get(id)!.lesson.kind]));

const passed = (p: Progress, id: string) => p.lessons[id]?.status === 'passed';

/** Chapters open once 70% of the previous chapter is done — a stumble on one
 *  lesson should not wall off a whole chapter. */
export const CHAPTER_UNLOCK_RATIO = 0.7;

export function chapterUnlocked(track: Track, chapterIdx: number, p: Progress): boolean {
  if (chapterIdx === 0) return true;
  const prev = track.chapters[chapterIdx - 1];
  const done = prev.lessons.filter((l) => passed(p, l.id)).length;
  return done / prev.lessons.length >= CHAPTER_UNLOCK_RATIO;
}

export function lessonUnlocked(id: string, p: Progress): boolean {
  const loc = index.get(id);
  if (!loc) return false;
  const chapterIdx = loc.track.chapters.indexOf(loc.chapter);
  if (!chapterUnlocked(loc.track, chapterIdx, p)) return false;
  if (loc.index === 0) return true;
  // Linear within a chapter, but only the immediately previous lesson gates you.
  return passed(p, loc.chapter.lessons[loc.index - 1].id);
}

export function chapterStats(chapter: Chapter, p: Progress) {
  const total = chapter.lessons.length;
  const done = chapter.lessons.filter((l) => passed(p, l.id)).length;
  const allFirstTry = chapter.lessons.every(
    (l) => p.lessons[l.id]?.firstTry && !p.lessons[l.id]?.solutionRevealed,
  );
  return { total, passed: done, allFirstTry };
}

export function chapterMap(p: Progress) {
  const m = new Map<string, { total: number; passed: number; allFirstTry: boolean }>();
  for (const track of tracks) {
    for (const chapter of track.chapters) m.set(chapter.id, chapterStats(chapter, p));
  }
  return m;
}

/** The lesson the dashboard's big "Continue" button should point at. */
export function nextUp(p: Progress): Located | undefined {
  const attempted = order.find((id) => p.lessons[id]?.status === 'attempted' && lessonUnlocked(id, p));
  if (attempted) return index.get(attempted);
  return index.get(order.find((id) => !passed(p, id) && lessonUnlocked(id, p)) ?? '');
}

/** Lesson shape sent to the browser: no solutions, no graders. */
export function publicLesson(loc: Located, p: Progress) {
  const { lesson } = loc;
  const rec = p.lessons[lesson.id];
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
    hints: (lesson.hints ?? []).slice(0, rec?.hintsUsed ?? 0),
    hasSolution: !!lesson.solution,
    solution: rec?.solutionRevealed ? lesson.solution : undefined,
    quiz: lesson.quiz?.map((q) => ({ q: q.q, options: q.options, multi: q.answer.length > 1 })),
    fixtures: lesson.kind === 'sql' ? lesson.fixtures : undefined,
    track: { id: loc.track.id, title: loc.track.title, color: loc.track.color, icon: loc.track.icon },
    chapter: { id: loc.chapter.id, title: loc.chapter.title },
    status: rec?.status ?? 'new',
    attempts: rec?.attempts ?? 0,
    xpAwarded: rec?.xpAwarded ?? 0,
    unlocked: lessonUnlocked(lesson.id, p),
    next: loc.chapter.lessons[loc.index + 1]?.id
      ?? loc.track.chapters[loc.track.chapters.indexOf(loc.chapter) + 1]?.lessons[0]?.id,
    prev: loc.chapter.lessons[loc.index - 1]?.id,
  };
}

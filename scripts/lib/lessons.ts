/**
 * Shared helpers for scripts that walk the curriculum: a flat lesson index
 * with its track/chapter context, the grader request for a lesson, and the
 * learner budget that applies to it. Generic over tracks and chapters.
 */
import { tracks } from '../../content/index.ts';
import type { Chapter, Lesson, Track } from '../../content/types.ts';
import { budgetFor, type RunRequest } from '../../server/runner/index.ts';

export interface LessonEntry {
  lesson: Lesson;
  track: Track;
  chapter: Chapter;
  /** Position within the chapter (0-based). */
  index: number;
}

export function allLessons(): LessonEntry[] {
  return tracks.flatMap((track) =>
    track.chapters.flatMap((chapter) => chapter.lessons.map((lesson, index) => ({ lesson, track, chapter, index }))));
}

export function findLesson(id: string): Lesson | undefined {
  return allLessons().find((e) => e.lesson.id === id)?.lesson;
}

/** A lesson the sandbox can grade (quizzes are graded by the server, not the sandbox). */
export const isRunnable = (l: Lesson): boolean =>
  l.kind !== 'quiz' && !!l.solution && (l.kind === 'mutation' || !!l.tests);

/** Everything the grader needs from a lesson, with `code` swapped in. */
export const requestFor = (l: Lesson, code: string, timeoutMs?: number): RunRequest => ({
  kind: l.kind, code, tests: l.tests, fixtures: l.fixtures,
  subject: l.subject, mutants: l.mutants, equivalents: l.equivalents, subjectKind: l.subjectKind,
  minTests: l.minTests, testTimeoutMs: l.testTimeoutMs,
  ...(timeoutMs !== undefined ? { timeoutMs } : {}),
});

/**
 * The learner's budget as the runner takes it in `RunRequest.timeoutMs`: per
 * run, or per implementation (variant) for `mutation` (server/runner/mutation.ts).
 */
export const budgetOf = (l: Lesson): number =>
  budgetFor(l.kind === 'mutation' ? (l.subjectKind === 'react' ? 'react' : 'js') : l.kind);

/**
 * The whole run's budget, to compare a run's wall time against. A `mutation`
 * lesson runs every variant in sequence — the subject, each equivalent, each
 * mutant — each with its own per-variant budget.
 */
export const totalBudgetOf = (l: Lesson): number =>
  l.kind === 'mutation'
    ? budgetOf(l) * (1 + (l.equivalents?.length ?? 0) + (l.mutants?.length ?? 0))
    : budgetOf(l);

/** Rough cost order, longest first, so a parallel pool does not end on one slow straggler. */
export const KIND_COST: Record<string, number> = {
  sql: 0, 'node-db': 0, typecheck: 1, react: 2, mutation: 2, node: 3, js: 4, ts: 4, quiz: 9,
};

/** Parse `--name=value` / `--flag` from argv. */
export function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
}

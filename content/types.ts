/**
 * Content model for the curriculum.
 *
 * A Track is a technology (js, ts, react, node, sql, craft).
 * A Track has Chapters; a Chapter has Lessons; the last lesson of a chapter is
 * usually a `boss` (bigger, multi-part, worth much more XP).
 */

export type LessonKind =
  | 'js'        // plain JS/TS module, graded by running tests in a Node worker
  | 'ts'        // same, but the source is TypeScript (transpiled before running)
  | 'typecheck' // graded by the TypeScript compiler: zero diagnostics == pass
  | 'react'     // rendered with react-dom + jsdom, graded with Testing Library
  | 'node'      // real Node: http servers, streams, fs, async
  | 'sql'       // real Postgres (PGlite/WASM), graded on query results or schema
  | 'quiz';     // concept checks: judgement calls that code can't grade

export interface QuizQuestion {
  /** Markdown-capable prompt. */
  q: string;
  options: string[];
  /** Indexes of correct options. More than one => multi-select. */
  answer: number[];
  /** Shown after answering, right or wrong. */
  explain: string;
}

export interface Lesson {
  id: string;
  title: string;
  kind: LessonKind;
  /** Base XP. Bosses are typically 3-5x a normal lesson. */
  xp: number;
  boss?: boolean;
  /** One-line "why a mid-level engineer needs this". */
  why: string;
  /** Markdown lesson body: concept, then the task. */
  brief: string;
  /** Code the editor opens with. */
  starter?: string;
  /** Reference solution. Revealable at an XP cost. */
  solution?: string;
  /**
   * Grading code. Runs in the sandbox with globals:
   *   describe/it/test/expect/beforeEach/afterEach/assert/fail
   *   solution  -> the user's module namespace (js/ts/react/node)
   *   db, userSql, runUserSql() -> for `sql` lessons
   * For `typecheck` lessons this is extra TypeScript appended as a spec file.
   */
  tests?: string;
  /** For `sql`: schema + seed data executed before the user's query. */
  fixtures?: string;
  /** Progressive hints. Each reveal costs XP. */
  hints?: string[];
  quiz?: QuizQuestion[];
  /** Concept tags, surfaced in the skill report. */
  tags?: string[];
}

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  lessons: Lesson[];
}

export interface Track {
  id: string;
  title: string;
  icon: string;
  color: string;
  blurb: string;
  /** Weight in the "mid-level readiness" score. */
  weight: number;
  chapters: Chapter[];
}

export const lesson = (l: Lesson): Lesson => l;
export const chapter = (c: Chapter): Chapter => c;
export const track = (t: Track): Track => t;

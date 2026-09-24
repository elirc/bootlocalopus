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
  | 'node-db'   // Node code against real Postgres: a seeded `db` global, no per-test transaction
  | 'mutation'  // the LEARNER writes the tests; graded against a correct implementation and buggy mutants
  | 'quiz';     // concept checks: judgement calls that code can't grade

/** A deliberately broken implementation the learner's tests must catch. */
export interface Mutant {
  /** Shown to the learner when their tests let it survive: what behaviour it breaks. */
  label: string;
  code: string;
}

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
   *   db, userSql, execUser(), queryUser(), q() -> for `sql` lessons
   *   db, q()   -> for `node-db` lessons (no per-test transaction)
   * For `typecheck` lessons this is extra TypeScript appended as a spec file.
   */
  tests?: string;
  /** For `sql`: schema + seed data executed before the user's query. */
  fixtures?: string;
  /**
   * For `mutation`: the correct implementation the learner writes tests
   * against, and the broken variants each of their tests must catch. The
   * learner's `starter`/`solution` are TEST files; `tests` is unused.
   */
  subject?: string;
  mutants?: Mutant[];
  /**
   * For `mutation`: rewrites of `subject` that behave identically. A learner's
   * test that fails one of these is testing implementation details, not
   * behaviour (e.g. `querySelector('.btn')` instead of `getByRole`).
   */
  equivalents?: string[];
  /** For `mutation`: which environment the subject needs (jsdom for `react`). Default `js`. */
  subjectKind?: 'js' | 'react' | 'node';
  /** For `mutation`: the learner must write at least this many tests. Default 3. */
  minTests?: number;
  /** Per-test timeout inside the sandbox, in ms. Default 5000. */
  testTimeoutMs?: number;
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
  /** Sidebar label; defaults to the first word of the title. */
  short?: string;
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

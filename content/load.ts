/**
 * Loads a chapter from disk: typed metadata comes from `chapter.ts`, every
 * piece of code or prose comes from the lesson's own folder. See AUTHORING.md.
 *
 * Synchronous on purpose: 500 lessons are ~2,300 small reads, once at startup, and
 * it keeps `import { tracks }` a plain static import everywhere.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Chapter, Lesson, LessonKind, Track } from './types.ts';

type CodeKind = Exclude<LessonKind, 'quiz'>;
/** Extension of starter/solution. For `mutation` these are the learner's test files. */
export const CODE_EXT: Record<CodeKind, string> = { js: 'js', ts: 'ts', typecheck: 'ts', react: 'jsx', node: 'js', sql: 'sql', 'node-db': 'js', mutation: 'js' };
/** Extension of the grader. `mutation` has none: the learner writes the tests. */
export const TEST_EXT: Record<Exclude<CodeKind, 'mutation'>, string> = { js: 'js', ts: 'js', typecheck: 'ts', react: 'js', node: 'js', sql: 'js', 'node-db': 'js' };

type FileField = 'brief' | 'starter' | 'solution' | 'tests' | 'fixtures' | 'subject' | 'mutants' | 'equivalents';
/** A mutant's file is `mutants/<n>-<slug>.<ext>` (n = 1-based position); its label lives here. */
export interface MutantMeta { slug: string; label: string }
export type LessonMeta = Omit<Lesson, FileField> & { mutants?: MutantMeta[] };
export type ChapterMeta = Omit<Chapter, 'lessons'> & { lessons: LessonMeta[] };

const ID = /^[a-z0-9-]+$/;

export function loadChapter(dir: string, meta: ChapterMeta): Chapter {
  const fail = (m: string): never => { throw new Error(`content: ${meta.id}: ${m}`); };
  if (!ID.test(meta.id)) fail('chapter id must be [a-z0-9-]');
  // `_draft-*` folders are lessons still being written: invisible until renamed
  // to their id and listed in chapter.ts, so a half-finished lesson never
  // makes the whole curriculum unloadable for everyone else.
  const entries = new Map(
    readdirSync(dir, { withFileTypes: true })
      .filter((d) => !d.name.startsWith('_draft-'))
      .map((d) => [d.name, d]),
  );
  if (!entries.delete('chapter.ts')) fail(`chapter.ts missing in ${dir}`);

  const lessons = meta.lessons.map((m): Lesson => {
    if (!ID.test(m.id)) fail(`${m.id}: id must be [a-z0-9-]`);
    if (!entries.get(m.id)?.isDirectory()) fail(`${m.id}: folder ${m.id}/ missing`);
    entries.delete(m.id);
    const ldir = path.join(dir, m.id);
    const left = new Set(walk(ldir));
    const take = (name: string, required: boolean): string | undefined => {
      if (!left.delete(name)) return required ? fail(`${m.id}/${name} missing`) : undefined;
      return readFileSync(path.join(ldir, name), 'utf8').replace(/\r\n/g, '\n');
    };
    const { mutants: mutantMeta, ...rest } = m;
    const lesson: Lesson = { ...rest, brief: take('brief.md', true)! };
    if (m.kind !== 'quiz') {
      const c = CODE_EXT[m.kind];
      lesson.starter = take(`starter.${c}`, true);
      lesson.solution = take(`solution.${c}`, true);
      if (m.kind === 'mutation') {
        const x = m.subjectKind === 'react' ? 'jsx' : 'js'; // subject, mutants, equivalents
        lesson.subject = take(`subject.${x}`, true);
        lesson.mutants = (mutantMeta ?? []).map((mu, i) => {
          if (!ID.test(mu.slug)) fail(`${m.id}: mutant slug "${mu.slug}" must be [a-z0-9-]`);
          return { label: mu.label, code: take(`mutants/${i + 1}-${mu.slug}.${x}`, true)! };
        });
        if (!lesson.mutants.length) fail(`${m.id}: a mutation lesson needs at least one mutant`);
        const eq: string[] = [];
        for (let n = 1, s; (s = take(`equivalents/${n}.${x}`, false)) !== undefined; n++) eq.push(s);
        if (eq.length) lesson.equivalents = eq;
      } else {
        lesson.tests = take(`tests.${TEST_EXT[m.kind]}`, true);
        const fx = m.kind === 'sql' || m.kind === 'node-db' ? take('fixtures.sql', false) : undefined;
        if (fx !== undefined) lesson.fixtures = fx;
      }
    } else if (mutantMeta) fail(`${m.id}: only mutation lessons take mutants`);
    // Catches typos (solutoin.js), the wrong extension for the kind, stray editor files.
    if (left.size) fail(`${m.id}: unexpected files ${[...left].join(', ')}`);
    return lesson;
  });

  if (entries.size) fail(`no lesson entry for ${[...entries.keys()].join(', ')}`);
  return { ...meta, lessons };
}

/** Every file under `dir`, as forward-slash relative paths. */
function walk(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name), `${prefix}${d.name}/`) : [`${prefix}${d.name}`]);
}

export const defineTrack = (t: Track): Track => t;

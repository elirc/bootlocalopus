/**
 * Content CI: runs every lesson's reference solution through the real grader
 * and asserts it passes, plus checks the starter code does NOT pass (otherwise
 * the lesson is a freebie). Run with `npm run verify`.
 */
import { runExercise, sweepRunsDir } from '../server/runner/index.ts';
import { tracks } from '../content/index.ts';
import type { Lesson } from '../content/types.ts';

const only = process.argv.find((a) => a.startsWith('--track='))?.split('=')[1];
const checkStarters = !process.argv.includes('--no-starters');

interface Problem { lesson: string; issue: string; detail?: string }
const problems: Problem[] = [];
let checked = 0;

const structural = (l: Lesson): string[] => {
  const errs: string[] = [];
  if (!l.brief?.trim()) errs.push('empty brief');
  if (!l.why?.trim()) errs.push('missing `why`');
  if (l.xp <= 0) errs.push('xp must be positive');
  if (l.kind === 'quiz') {
    if (!l.quiz?.length) errs.push('quiz lesson with no questions');
    l.quiz?.forEach((q, i) => {
      if (!q.answer.length) errs.push(`q${i + 1}: no correct answer`);
      if (q.answer.some((a) => a < 0 || a >= q.options.length)) errs.push(`q${i + 1}: answer index out of range`);
      if (!q.explain?.trim()) errs.push(`q${i + 1}: missing explanation`);
      if (new Set(q.options).size !== q.options.length) errs.push(`q${i + 1}: duplicate options`);
    });
  } else {
    if (!l.tests?.trim()) errs.push('no tests');
    if (!l.solution?.trim()) errs.push('no reference solution');
    if (!l.starter?.trim()) errs.push('no starter code');
    if (!l.hints?.length) errs.push('no hints');
  }
  return errs;
};

for (const track of tracks) {
  if (only && track.id !== only) continue;
  for (const chapter of track.chapters) {
    for (const lesson of chapter.lessons) {
      checked++;
      for (const issue of structural(lesson)) {
        problems.push({ lesson: lesson.id, issue });
      }
      if (lesson.kind === 'quiz' || !lesson.solution || !lesson.tests) continue;

      const pass = await runExercise({
        kind: lesson.kind,
        code: lesson.solution,
        tests: lesson.tests,
        fixtures: lesson.fixtures,
      });
      if (!pass.ok) {
        const failed = pass.tests.filter((t) => !t.passed);
        problems.push({
          lesson: lesson.id,
          issue: 'REFERENCE SOLUTION FAILS',
          detail: pass.error ?? failed.map((t) => `${t.name}: ${t.error}`).join('\n      '),
        });
        process.stdout.write('F');
      } else if (checkStarters && lesson.starter) {
        const starter = await runExercise({
          kind: lesson.kind,
          code: lesson.starter,
          tests: lesson.tests,
          fixtures: lesson.fixtures,
        });
        if (starter.ok) {
          problems.push({ lesson: lesson.id, issue: 'STARTER ALREADY PASSES (nothing to solve)' });
          process.stdout.write('S');
        } else {
          process.stdout.write('.');
        }
      } else {
        process.stdout.write('.');
      }
    }
  }
}

console.log(`\n\nChecked ${checked} lessons across ${tracks.length} track(s).`);
if (!problems.length) {
  console.log('All reference solutions pass and all starters fail. Content is sound.');
  await sweepRunsDir();
  process.exit(0);
}
console.log(`\n${problems.length} problem(s):\n`);
for (const p of problems) {
  console.log(`  ✗ ${p.lesson}: ${p.issue}`);
  if (p.detail) console.log(`      ${p.detail.slice(0, 900)}`);
}
await sweepRunsDir();
process.exit(1);

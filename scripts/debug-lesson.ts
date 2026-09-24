/**
 * Run one lesson's reference solution (or starter) with a long budget and print every row.
 *
 *   npx tsx scripts/debug-lesson.ts <lesson-id> [--starter] [--budget=ms]
 */
import { runExercise, budgetFor } from '../server/runner/index.ts';
import { tracks } from '../content/index.ts';

const id = process.argv[2];
const useStarter = process.argv.includes('--starter');
const budgetArg = process.argv.find((a) => a.startsWith('--budget='))?.split('=')[1];
const lesson = tracks
  .flatMap((t) => t.chapters)
  .flatMap((c) => c.lessons)
  .find((l) => l.id === id);

if (!lesson) {
  console.error(`No lesson "${id}"`);
  process.exit(1);
}
if (lesson.kind === 'quiz') {
  console.error(`"${id}" is a quiz; nothing to run`);
  process.exit(1);
}

const r = await runExercise({
  kind: lesson.kind,
  code: (useStarter ? lesson.starter : lesson.solution) ?? '',
  tests: lesson.tests,
  fixtures: lesson.fixtures,
  subject: lesson.subject,
  mutants: lesson.mutants,
  equivalents: lesson.equivalents,
  subjectKind: lesson.subjectKind,
  minTests: lesson.minTests,
  testTimeoutMs: lesson.testTimeoutMs,
  timeoutMs: budgetArg ? Number(budgetArg) : 90_000,
});

const normal = budgetFor(lesson.kind === 'mutation' ? (lesson.subjectKind === 'react' ? 'react' : 'js') : lesson.kind);
console.log(`ok=${r.ok} ms=${r.ms} boot=${r.bootMs ?? '-'}ms graded=${r.ms - (r.bootMs ?? 0)}ms (normal budget ${normal}ms)` +
  `${r.timedOut ? ' TIMEOUT' : ''}${r.phase ? ` phase=${r.phase}` : ''}${r.mutation ? ` mutation=${r.mutation.score} (${r.mutation.stage})` : ''}`);
if (r.error) console.log(`ERROR: ${r.error}`);
for (const t of r.tests) {
  console.log(`  ${t.passed ? 'PASS' : 'FAIL'} ${t.name}${t.ms !== undefined ? ` (${t.ms}ms)` : ''}`);
  if (t.error) console.log(t.error.split('\n').map((l) => '       ' + l).join('\n'));
}
for (const l of r.logs) console.log(`  [${l.level}] ${l.text}`);
process.exit(0);

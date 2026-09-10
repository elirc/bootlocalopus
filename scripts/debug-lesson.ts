/** Run one lesson's reference solution (or starter) with a long timeout and print every test. */
import { runExercise } from '../server/runner/index.ts';
import { tracks } from '../content/index.ts';

const id = process.argv[2];
const useStarter = process.argv.includes('--starter');
const lesson = tracks
  .flatMap((t) => t.chapters)
  .flatMap((c) => c.lessons)
  .find((l) => l.id === id);

if (!lesson) {
  console.error(`No lesson "${id}"`);
  process.exit(1);
}

const r = await runExercise({
  kind: lesson.kind,
  code: (useStarter ? lesson.starter : lesson.solution) ?? '',
  tests: lesson.tests,
  fixtures: lesson.fixtures,
  timeoutMs: 90_000,
});

console.log(`ok=${r.ok} ms=${r.ms}${r.timedOut ? ' TIMEOUT' : ''}`);
if (r.error) console.log(`ERROR: ${r.error}`);
for (const t of r.tests) {
  console.log(`  ${t.passed ? 'PASS' : 'FAIL'} ${t.name} (${t.ms}ms)`);
  if (t.error) console.log(t.error.split('\n').map((l) => '       ' + l).join('\n'));
}
for (const l of r.logs) console.log(`  [${l.level}] ${l.text}`);
process.exit(0);

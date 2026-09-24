/**
 * Content CI. Static checks on every selected lesson, then every reference
 * solution through the real grader (it must pass) and every starter (it must
 * FAIL, by failing its tests — not by hanging or breaking the grader).
 *
 *   npm run verify                         everything, in parallel
 *   npm run verify -- --track=sql          one track
 *   npm run verify -- --lesson=a,b         named lessons
 *   npm run verify -- --changed            lessons touched per git (diff vs HEAD + untracked)
 *   npm run verify -- --changed --max=12   … but only static checks if more than 12 are touched
 *   npm run verify -- --jobs=1             serial (default: see JOBS below)
 *   npm run verify -- --structural         static checks only, no sandbox runs
 *   npm run verify -- --no-starters        skip the starter-must-fail runs
 *   npm run verify -- --json[=file]        machine-readable summary (stdout, or a file)
 *   npm run verify -- --files=a,b          --changed with an explicit file list instead of git
 *
 * VERIFY_JOBS and VERIFY_JSON set the --jobs and --json=<file> defaults (CI uses them).
 *
 * Budgets: serial runs use the learner's budget. Parallel runs give each run
 * 3× the learner budget (the machine is shared), and anything that timed out,
 * failed to boot, or passed only by exceeding the 1× budget is re-run ONCE,
 * serially, at the learner's budget — so the verdict is always the one a
 * learner on this machine would get. A run that passes only on that retry is
 * reported FLAKY rather than failed. Learner budgets are never loosened.
 *
 * Exit code: 1 on any error (warnings and FLAKY do not fail the run).
 */
import { writeFileSync } from 'node:fs';
import { availableParallelism, freemem } from 'node:os';
import { runExercise, sweepRunsDir, type RunResult } from '../server/runner/index.ts';
import { allLessons, arg, budgetOf, totalBudgetOf, isRunnable, KIND_COST, requestFor, type LessonEntry } from './lib/lessons.ts';
import { gitChangedFiles, lessonsForFiles } from './lib/changed.ts';

/* --------------------------------------------------------------- options */

// Environment defaults, so CI can run plain `npm test`: VERIFY_JOBS=N, VERIFY_JSON=<file>.
const jsonArg = arg('json') ?? (process.env.VERIFY_JSON || undefined);
const jsonToStdout = jsonArg === '';
/** With `--json` on stdout, the human log goes to stderr so stdout stays parseable. */
const log = (s = '') => (jsonToStdout ? process.stderr : process.stdout).write(s + '\n');
const fatal = (msg: string): never => {
  log(`verify: ${msg}`);
  process.exit(2);
};

const onlyTrack = arg('track');
const onlyLessons = arg('lesson')?.split(',').map((s) => s.trim()).filter(Boolean);
const filesArg = arg('files');
const changed = arg('changed') !== undefined || filesArg !== undefined;
const checkStarters = arg('no-starters') === undefined;
const structuralOnly = arg('structural') !== undefined;
const maxArg = arg('max');
const max = maxArg ? Number(maxArg) : Infinity;
if (!(max > 0)) fatal(`--max must be a positive number, got "${maxArg}"`);

const MB = 1024 * 1024;
/** clamp(1, min(cores − 2, freemem / 700 MB), 4): sql/react workers cost ~300 MB each; 4 is the measured cap. */
const defaultJobs = () =>
  Math.max(1, Math.min(availableParallelism() - 2, Math.floor(freemem() / (700 * MB)), 4));
const jobsArg = arg('jobs') ?? (process.env.VERIFY_JOBS || undefined);
const JOBS = jobsArg !== undefined ? Number(jobsArg) : defaultJobs();
if (!Number.isInteger(JOBS) || JOBS < 1) fatal(`--jobs must be a positive integer, got "${jobsArg}"`);
const PARALLEL = JOBS > 1;
const SCALE = PARALLEL ? 3 : 1;

/* ------------------------------------------------------------- selection */

const everything = allLessons();
const knownIds = new Set(everything.map((e) => e.lesson.id));
let selected: LessonEntry[] = everything;

if (onlyTrack !== undefined) {
  selected = selected.filter((e) => e.track.id === onlyTrack);
  if (!selected.length) {
    fatal(`--track=${onlyTrack} matches no track (tracks: ${[...new Set(everything.map((e) => e.track.id))].join(', ')})`);
  }
}
if (onlyLessons) {
  const unknown = onlyLessons.filter((id) => !knownIds.has(id));
  if (unknown.length) fatal(`no such lesson: ${unknown.join(', ')}`);
  selected = selected.filter((e) => onlyLessons.includes(e.lesson.id));
  if (!selected.length) fatal('--lesson and --track select nothing together');
}
let changedFiles: string[] | undefined;
if (changed) {
  try {
    changedFiles = filesArg !== undefined ? filesArg.split(',').map((s) => s.trim()).filter(Boolean) : gitChangedFiles();
  } catch (e) {
    fatal(`--changed needs git: ${(e as Error).message.split('\n')[0]}`);
  }
  const sel = lessonsForFiles(changedFiles!, knownIds);
  selected = selected.filter((e) => sel.ids.has(e.lesson.id));
  log(`--changed: ${changedFiles!.length} changed file(s) select ${selected.length} lesson(s)` +
    (sel.all ? ` (everything: ${sel.reasons.get('*')} changed)` : ''));
  if (!sel.all) for (const e of selected) log(`  ${e.lesson.id.padEnd(32)} <- ${sel.reasons.get(e.lesson.id)}`);
  if (!selected.length) {
    log('Nothing to verify.');
    if (jsonArg !== undefined) emitJson({ ok: true, selected: [], changedFiles });
    process.exit(0);
  }
}

/* ------------------------------------------------------ static checks */

type Level = 'error' | 'warning' | 'flaky';
interface Finding { lesson: string; level: Level; issue: string; detail?: string }
const findings: Finding[] = [];
const error = (lesson: string, issue: string, detail?: string) => findings.push({ lesson, level: 'error', issue, detail });
const warn = (lesson: string, issue: string, detail?: string) => findings.push({ lesson, level: 'warning', issue, detail });

const XP_NORMAL = [40, 120] as const;
const XP_BOSS = [150, 300] as const;

function structural({ lesson: l, chapter, index }: LessonEntry) {
  if (!l.brief?.trim()) error(l.id, 'empty brief');
  if (!l.why?.trim()) error(l.id, 'missing `why`');
  if (!(l.xp > 0)) error(l.id, 'xp must be positive');
  const [lo, hi] = l.boss ? XP_BOSS : XP_NORMAL;
  if (l.xp > 0 && (l.xp < lo || l.xp > hi)) warn(l.id, `xp ${l.xp} is outside the ${l.boss ? 'boss' : 'normal'} band ${lo}–${hi}`);
  if (l.boss && index !== chapter.lessons.length - 1) warn(l.id, `boss is not the last lesson of chapter ${chapter.id}`);
  if (l.kind === 'quiz') {
    if (!l.quiz?.length) error(l.id, 'quiz lesson with no questions');
    l.quiz?.forEach((q, i) => {
      if (q.options.length < 2 || q.options.length > 6) error(l.id, `q${i + 1}: ${q.options.length} options (want 2–6)`);
      if (!q.answer.length) error(l.id, `q${i + 1}: no correct answer`);
      if (q.answer.some((a) => !Number.isInteger(a) || a < 0 || a >= q.options.length)) error(l.id, `q${i + 1}: answer index out of range`);
      if (new Set(q.answer).size !== q.answer.length) error(l.id, `q${i + 1}: duplicate answer index`);
      if (!q.explain?.trim()) error(l.id, `q${i + 1}: missing explanation`);
      if (new Set(q.options).size !== q.options.length) error(l.id, `q${i + 1}: duplicate options`);
    });
  } else {
    if (l.kind !== 'mutation' && !l.tests?.trim()) error(l.id, 'no tests');
    if (!l.solution?.trim()) error(l.id, 'no reference solution');
    if (!l.starter?.trim()) error(l.id, 'no starter code');
    if (!l.hints?.length) error(l.id, 'no hints');
  }
}

// Duplicate ids across ALL tracks, not just the selection: a new lesson can collide with one elsewhere.
{
  const seen = new Map<string, string>();
  for (const { lesson, track, chapter } of everything) {
    const where = `${track.id}/${chapter.id}`;
    const prev = seen.get(lesson.id);
    if (prev) error(lesson.id, `duplicate lesson id (${prev} and ${where})`);
    else seen.set(lesson.id, where);
  }
  const chapters = new Map<string, string>();
  for (const t of new Set(everything.map((e) => e.track))) {
    for (const c of t.chapters) {
      const prev = chapters.get(c.id);
      if (prev) error(c.id, `duplicate chapter id (${prev} and ${t.id})`);
      else chapters.set(c.id, t.id);
    }
  }
}

for (const entry of selected) structural(entry);

// Answer-position bias: learners learn "it's usually A" faster than the material.
{
  const counts = new Map<number, number>();
  let singles = 0;
  for (const { lesson } of selected) {
    for (const q of lesson.quiz ?? []) {
      if (q.answer.length !== 1) continue;
      singles++;
      counts.set(q.answer[0], (counts.get(q.answer[0]) ?? 0) + 1);
    }
  }
  const [topIndex, top] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  if (singles >= 5 && top / singles > 0.7) {
    warn('(quizzes)', `${top} of ${singles} single-answer questions (${Math.round((top / singles) * 100)}%) have the answer at index ${topIndex}; spread the correct option around`);
  }
}

/* ------------------------------------------------------- sandbox runs */

type Role = 'solution' | 'starter';
interface Job { entry: LessonEntry; role: Role }
interface Runs { first?: RunResult; retry?: RunResult }
const runs = new Map<string, Record<Role, Runs>>();
const runsOf = (id: string) => {
  let r = runs.get(id);
  if (!r) runs.set(id, (r = { solution: {}, starter: {} }));
  return r;
};

const runnable = selected.filter((e) => isRunnable(e.lesson));
let sandbox = !structuralOnly;
if (sandbox && runnable.length > max) {
  warn('(selection)', `${runnable.length} lessons selected, over --max=${max}: static checks only. Run \`npm run verify\` for the full check.`);
  sandbox = false;
}

const jobs: Job[] = sandbox
  ? runnable
    .flatMap((entry): Job[] => [
      { entry, role: 'solution' },
      ...(checkStarters && entry.lesson.starter ? [{ entry, role: 'starter' as const }] : []),
    ])
    .sort((a, b) => (KIND_COST[a.entry.lesson.kind] ?? 5) - (KIND_COST[b.entry.lesson.kind] ?? 5))
  : [];

const secs = (ms?: number) => (ms === undefined ? '-' : `${(ms / 1000).toFixed(1)}s`);
const graded = (r: RunResult) => r.ms - (r.bootMs ?? 0);
const describeRun = (r?: RunResult) => {
  if (!r) return '';
  const tag = r.timedOut ? ' TIMEOUT' : r.phase ? ` ${r.phase}` : '';
  return `${secs(r.ms)}${r.bootMs !== undefined ? ` (boot ${secs(r.bootMs)})` : ''}${tag}`;
};
/** The starter failed the way it should: in its tests, having booted, without hanging or breaking the grader. */
const starterFailsProperly = (r: RunResult) => !r.ok && !r.timedOut && r.ready && r.phase !== 'grader' && r.phase !== 'boot';
/** Worth one serial retry: the environment, not the code, may be to blame. */
const needsRetry = (l: LessonEntry['lesson'], role: Role, r: RunResult) =>
  r.timedOut === true || r.phase === 'boot' ||
  (role === 'solution' && PARALLEL && r.ok && graded(r) > totalBudgetOf(l));

const started = Date.now();
let doneLessons = 0;
const expected = new Map<string, number>();
for (const j of jobs) expected.set(j.entry.lesson.id, (expected.get(j.entry.lesson.id) ?? 0) + 1);

function lessonLine(entry: LessonEntry, prefix = '') {
  const r = runsOf(entry.lesson.id);
  const sol = r.solution.retry ?? r.solution.first;
  const st = r.starter.retry ?? r.starter.first;
  const good = !!sol?.ok && (!st || starterFailsProperly(st));
  const mark = good ? 'ok  ' : 'FAIL';
  log(`${prefix}${mark} ${entry.lesson.id.padEnd(34)} ${entry.lesson.kind.padEnd(9)} ref ${describeRun(sol).padEnd(22)}` +
    (st ? ` starter ${describeRun(st)}` : ''));
}

async function runJob(job: Job, timeoutMs?: number): Promise<RunResult> {
  const { lesson } = job.entry;
  const code = job.role === 'solution' ? lesson.solution! : lesson.starter!;
  try {
    return await runExercise(requestFor(lesson, code, timeoutMs));
  } catch (e) {
    return { ok: false, tests: [], logs: [], ms: 0, ready: false, phase: 'sandbox', error: `runExercise threw: ${(e as Error).stack ?? e}` };
  }
}

if (jobs.length) {
  log(`Running ${runnable.length} lesson(s), ${jobs.length} sandbox run(s), ${JOBS} at a time` +
    (PARALLEL ? ` (budgets ×${SCALE} in the pool; timeouts retried serially at 1×)` : ' (learner budgets)') + '\n');
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      // The runner takes a per-variant budget for `mutation`; scale that, not the total.
      const r = await runJob(job, PARALLEL ? SCALE * budgetOf(job.entry.lesson) : undefined);
      runsOf(job.entry.lesson.id)[job.role].first = r;
      const id = job.entry.lesson.id;
      expected.set(id, expected.get(id)! - 1);
      if (expected.get(id) === 0) {
        doneLessons++;
        lessonLine(job.entry, `[${String(doneLessons).padStart(3)}/${runnable.length}] `);
      }
    }
  }));

  const retries = jobs.filter((j) => needsRetry(j.entry.lesson, j.role, runsOf(j.entry.lesson.id)[j.role].first!));
  if (retries.length) {
    log(`\nRetrying ${retries.length} run(s) serially at the learner budget:`);
    for (const job of retries) {
      const r = await runJob(job);
      runsOf(job.entry.lesson.id)[job.role].retry = r;
      log(`  retry ${job.entry.lesson.id} ${job.role}: ${r.ok ? 'passed' : 'failed'} ${describeRun(r)}`);
    }
  }
}

/* ------------------------------------------------------------ verdicts */

const detailOf = (r: RunResult) =>
  r.error ?? r.tests.filter((t) => !t.passed).map((t) => `${t.name}: ${t.error}`).join('\n      ');

for (const entry of runnable) {
  if (!runs.has(entry.lesson.id)) continue;
  const { lesson } = entry;
  const budget = totalBudgetOf(lesson);
  const r = runsOf(lesson.id);

  const sFirst = r.solution.first!;
  const sol = r.solution.retry ?? sFirst;
  const solRetriedAfterTimeout = !!r.solution.retry && (sFirst.timedOut || sFirst.phase === 'boot');
  if (!sol.ok) {
    error(lesson.id, 'REFERENCE SOLUTION FAILS' + (r.solution.retry ? ' (on the serial retry at the learner budget)' : ''), detailOf(sol));
  } else {
    if (solRetriedAfterTimeout) {
      findings.push({ lesson: lesson.id, level: 'flaky', issue: `reference ${sFirst.timedOut ? 'timed out' : 'failed to boot'} in the pool, passed on the serial retry (${secs(graded(sol))} of ${secs(budget)})` });
    }
    if (graded(sol) > 0.5 * budget) {
      warn(lesson.id, `reference took ${graded(sol)}ms of a ${budget}ms budget (over half)` +
        (!r.solution.retry && PARALLEL ? ` — measured under ${JOBS}-way load` : ''));
    }
  }

  const tFirst = r.starter.first;
  if (tFirst) {
    const st = r.starter.retry ?? tFirst;
    if (st.ok) error(lesson.id, 'STARTER ALREADY PASSES (nothing to solve)');
    else if (st.timedOut) error(lesson.id, 'STARTER TIMES OUT (it should fail its tests, not hang)' + (r.starter.retry ? ' (also on the serial retry)' : ''), st.error);
    else if (!st.ready || st.phase === 'boot') error(lesson.id, 'STARTER RUN NEVER BOOTED', st.error);
    else if (st.phase === 'grader') error(lesson.id, 'STARTER BREAKS THE GRADER', st.error);
    else if (r.starter.retry) {
      findings.push({ lesson: lesson.id, level: 'flaky', issue: 'starter timed out in the pool, failed its tests properly on the serial retry' });
    }
  }
}

/* -------------------------------------------------------------- report */

const errors = findings.filter((f) => f.level === 'error');
const warnings = findings.filter((f) => f.level === 'warning');
const flaky = findings.filter((f) => f.level === 'flaky');
const elapsed = Date.now() - started;

log(`\nChecked ${selected.length} lesson(s) across ${new Set(selected.map((e) => e.track.id)).size} track(s)` +
  (jobs.length ? `; ${jobs.length} sandbox run(s) in ${secs(elapsed)} with --jobs=${JOBS}.` : '; static checks only.'));

const print = (title: string, list: Finding[], mark: string) => {
  if (!list.length) return;
  log(`\n${list.length} ${title}:\n`);
  for (const f of list) {
    log(`  ${mark} ${f.lesson}: ${f.issue}`);
    if (f.detail) log(`      ${f.detail.slice(0, 900)}`);
  }
};
print('warning(s)', warnings, '!');
print('FLAKY (passed on retry)', flaky, '~');
print('problem(s)', errors, '✗');
if (!errors.length) {
  log(sandbox && jobs.length
    ? '\nAll reference solutions pass and all starters fail. Content is sound.'
    : '\nStatic checks pass.');
}

if (jsonArg !== undefined) {
  emitJson({
    ok: errors.length === 0,
    jobs: JOBS,
    budgetScale: SCALE,
    elapsedMs: elapsed,
    changedFiles,
    selected: selected.map((e) => e.lesson.id),
    lessons: runnable.filter((e) => runs.has(e.lesson.id)).map(({ lesson, track, chapter }) => {
      const r = runsOf(lesson.id);
      const brief = (x?: RunResult) => x && ({ ok: x.ok, ms: x.ms, bootMs: x.bootMs, timedOut: !!x.timedOut, phase: x.phase, ready: x.ready });
      return {
        id: lesson.id, track: track.id, chapter: chapter.id, kind: lesson.kind, budgetMs: totalBudgetOf(lesson),
        solution: brief(r.solution.first), solutionRetry: brief(r.solution.retry),
        starter: brief(r.starter.first), starterRetry: brief(r.starter.retry),
      };
    }),
    errors, warnings, flaky,
  });
}

await sweepRunsDir();
process.exit(errors.length ? 1 : 0);

function emitJson(summary: Record<string, unknown>) {
  const text = JSON.stringify(summary, null, 2);
  if (jsonToStdout) process.stdout.write(text + '\n');
  else writeFileSync(jsonArg!, text + '\n');
}

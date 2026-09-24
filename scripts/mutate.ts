/**
 * Minimal mutation check for GRADERS: mutate each reference solution in small,
 * behaviour-changing ways and run the mutants through the real grader. A
 * mutant that still passes every test ("SURVIVED") points at a gap in the
 * lesson's tests — a broken answer a learner could submit and be paid for.
 *
 *   npm run mutate -- --lesson=js-once-memoize
 *   npm run mutate -- --track=sql --limit=4
 *   npm run mutate -- --all
 *
 * Options: --limit=N mutants per lesson (default 6, spread across operators
 * and positions, deterministic), --jobs=N parallel runs (default 2),
 * --accepted=<file> known-equivalent survivors (default
 * scripts/mutants-accepted.json if present):
 *   { "<lesson-id>": [{ "op": "retundef", "line": "return result;", "why": "…" }] }
 * keyed by the mutated line's trimmed text, which survives edits elsewhere.
 *
 * Operators — JS/TS/React/Node: `eq` (=== ↔ !==), `rel` (< ↔ <=, > ↔ >=),
 * `logic` (&& ↔ ||), `retundef` (return X → return undefined), `await` (drop
 * an await). SQL: `rel`, `logic` (and ↔ or), `sqlkw` (drop not null / unique /
 * distinct, left join → join, desc → asc). Strings and comments are never
 * mutated. `typecheck`, `quiz` and `mutation` lessons are skipped.
 *
 * Verdicts: KILLED = tests failed; SURVIVED = all tests passed; TIMEOUT =
 * inconclusive, NEVER counted as a kill (a loaded machine must not fake a
 * strong grader); INVALID = did not compile/load (no signal either way).
 * Each mutant gets 3× the learner budget. Exit 1 if an unaccepted mutant
 * survived. Not part of `npm test`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runExercise, sweepRunsDir, type RunResult } from '../server/runner/index.ts';
import type { Lesson } from '../content/types.ts';
import { allLessons, arg, budgetOf, isRunnable, requestFor } from './lib/lessons.ts';
import { repoRoot } from './lib/changed.ts';

type Op = 'eq' | 'rel' | 'logic' | 'retundef' | 'await' | 'sqlkw';
interface Mutant { op: Op; at: number; from: string; to: string; line: number; lineText: string; code: string }
type Verdict = 'KILLED' | 'SURVIVED' | 'TIMEOUT' | 'INVALID';

/* ----------------------------------------------------------- masking */

/**
 * Same-length copy of `src` with comment and string contents blanked, so
 * operators only ever match real code. Template literals are blanked whole.
 */
function mask(src: string, sql: boolean): string {
  const out = src.split('');
  const blank = (from: number, to: number) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (!sql && c === '/' && n === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; blank(i, end); i = end; continue; }
    if (sql && c === '-' && n === '-') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; blank(i, end); i = end; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; blank(i, end); i = end; continue; }
    if (c === "'" || (!sql && (c === '"' || c === '`'))) {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' && !sql ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join('');
}

const balanced = (s: string) => {
  let depth = 0;
  for (const ch of s) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch) && --depth < 0) return false;
  }
  return depth === 0;
};

/* --------------------------------------------------------- operators */

function candidates(code: string, kind: Lesson['kind']): Mutant[] {
  const sql = kind === 'sql';
  const masked = mask(code, sql);
  const found: Mutant[] = [];
  const add = (op: Op, at: number, from: string, to: string) => {
    const lineStart = code.lastIndexOf('\n', at - 1) + 1;
    const lineEnd = code.indexOf('\n', at);
    const lineText = code.slice(lineStart, lineEnd < 0 ? code.length : lineEnd).trim();
    found.push({
      op, at, from, to, lineText,
      line: code.slice(0, at).split('\n').length,
      code: code.slice(0, at) + to + code.slice(at + from.length),
    });
  };
  const each = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    for (let m; (m = re.exec(masked)); ) fn(m);
  };
  // Whitespace on both sides keeps JSX tags, generics and `=>` out of it.
  const REL: Record<string, string> = { '<': '<=', '<=': '<', '>': '>=', '>=': '>' };
  each(/(?<=\s)(<=|>=|<|>)(?=\s)/g, (m) => add('rel', m.index, m[1], REL[m[1]]));

  if (sql) {
    each(/\b(and|or)\b/gi, (m) => {
      if (/between\s+\S+\s*$/i.test(masked.slice(Math.max(0, m.index - 60), m.index))) return; // between x and y
      add('logic', m.index, m[1], /and/i.test(m[1]) ? 'or' : 'and');
    });
    each(/\bnot\s+null\b/gi, (m) => add('sqlkw', m.index, m[0], ''));
    each(/\bunique\b/gi, (m) => add('sqlkw', m.index, m[0], ''));
    each(/\bdistinct\b/gi, (m) => add('sqlkw', m.index, m[0], ''));
    each(/\bleft\s+join\b/gi, (m) => add('sqlkw', m.index, m[0], 'join'));
    each(/\bdesc\b/gi, (m) => add('sqlkw', m.index, m[0], 'asc'));
  } else {
    const EQ: Record<string, string> = { '===': '!==', '!==': '===', '==': '!=', '!=': '==' };
    each(/!==|===|!=|==/g, (m) => add('eq', m.index, m[0], EQ[m[0]]));
    each(/&&|\|\|/g, (m) => add('logic', m.index, m[0], m[0] === '&&' ? '||' : '&&'));
    each(/\bawait\s+/g, (m) => add('await', m.index, m[0], ''));
    each(/\breturn\s+([^;\n]+?)\s*(;|$)/gm, (m) => {
      const expr = code.slice(m.index, m.index + m[0].length).replace(/^return\s+/, '').replace(/;$/, '').trim();
      if (expr === 'undefined' || !balanced(expr)) return;
      add('retundef', m.index, code.slice(m.index, m.index + m[0].length), `return undefined${m[2]}`);
    });
  }
  return found;
}

/** Up to `limit` mutants: round-robin over operators, evenly spaced within each. Deterministic. */
function sample(all: Mutant[], limit: number): Mutant[] {
  const byOp = new Map<Op, Mutant[]>();
  for (const m of all) byOp.set(m.op, [...(byOp.get(m.op) ?? []), m]);
  const spread = (xs: Mutant[]) => {
    // Middle-out even spacing: first, last, middle, quarters, …
    const order: Mutant[] = [];
    const seen = new Set<number>();
    for (let parts = 1; order.length < xs.length; parts *= 2) {
      for (let k = 0; k <= parts; k++) {
        const idx = Math.round((k / parts) * (xs.length - 1));
        if (!seen.has(idx)) { seen.add(idx); order.push(xs[idx]); }
      }
    }
    return order;
  };
  const queues = [...byOp.values()].map(spread);
  const picked: Mutant[] = [];
  while (picked.length < limit && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && picked.length < limit) picked.push(q.shift()!);
  }
  return picked.sort((a, b) => a.at - b.at);
}

const verdictOf = (r: RunResult): Verdict =>
  r.ok ? 'SURVIVED' : r.timedOut ? 'TIMEOUT' : r.phase || !r.ready ? 'INVALID' : 'KILLED';

/* ----------------------------------------------------------------- main */

const trackArg = arg('track');
const lessonArg = arg('lesson')?.split(',').filter(Boolean);
const all = arg('all') !== undefined;
const limit = Number(arg('limit') ?? 6);
const jobs = Number(arg('jobs') ?? 2);
if (!trackArg && !lessonArg && !all) {
  console.error('usage: npm run mutate -- --lesson=<id>[,<id>] | --track=<id> | --all  [--limit=6] [--jobs=2]');
  process.exit(2);
}
if (!(limit > 0) || !Number.isInteger(jobs) || jobs < 1) {
  console.error('--limit and --jobs must be positive integers');
  process.exit(2);
}

const acceptedPath = arg('accepted') ?? path.join(repoRoot, 'scripts', 'mutants-accepted.json');
const accepted: Record<string, { op: string; line: string }[]> =
  existsSync(acceptedPath) ? JSON.parse(readFileSync(acceptedPath, 'utf8')) : {};

const SKIP = new Set(['typecheck', 'quiz', 'mutation']);
let entries = allLessons();
if (trackArg) entries = entries.filter((e) => e.track.id === trackArg);
if (lessonArg) {
  const missing = lessonArg.filter((id) => !entries.some((e) => e.lesson.id === id));
  if (missing.length) { console.error(`no such lesson: ${missing.join(', ')}`); process.exit(2); }
  entries = entries.filter((e) => lessonArg.includes(e.lesson.id));
}
const skipped = entries.filter((e) => SKIP.has(e.lesson.kind) || !isRunnable(e.lesson));
entries = entries.filter((e) => !SKIP.has(e.lesson.kind) && isRunnable(e.lesson));
// Bosses first: they carry the most XP.
entries.sort((a, b) => Number(!!b.lesson.boss) - Number(!!a.lesson.boss));
if (!entries.length) {
  console.error(`nothing to mutate (${skipped.length} lesson(s) skipped: typecheck/quiz/mutation kinds are not supported)`);
  process.exit(2);
}

const tally: Record<Verdict, number> = { KILLED: 0, SURVIVED: 0, TIMEOUT: 0, INVALID: 0 };
const survivors: { lesson: string; m: Mutant; accepted: boolean }[] = [];
const pad = (s: string, n: number) => s.padEnd(n);

for (const { lesson } of entries) {
  const budget = 3 * budgetOf(lesson);
  const base = await runExercise(requestFor(lesson, lesson.solution!, budget));
  if (!base.ok) {
    console.log(`\n${lesson.id}: reference solution does not pass (${base.error ?? 'tests failed'}); skipped`);
    continue;
  }
  const pool = candidates(lesson.solution!, lesson.kind);
  const picked = sample(pool, limit);
  console.log(`\n${lesson.id} (${lesson.kind}): ${picked.length} of ${pool.length} candidate mutant(s), ${budget}ms budget each`);
  const results: { m: Mutant; v: Verdict; r: RunResult }[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, picked.length) }, async () => {
    while (next < picked.length) {
      const m = picked[next++];
      const r = await runExercise(requestFor(lesson, m.code, budget));
      results.push({ m, v: verdictOf(r), r });
    }
  }));
  results.sort((a, b) => a.m.at - b.m.at);
  for (const { m, v, r } of results) {
    tally[v]++;
    const ok = accepted[lesson.id]?.some((a) => a.op === m.op && a.line.trim() === m.lineText);
    if (v === 'SURVIVED') survivors.push({ lesson: lesson.id, m, accepted: !!ok });
    const passed = r.tests.filter((t) => t.passed).length;
    const why = v === 'SURVIVED' ? `all ${r.tests.length} tests passed${ok ? ' (accepted)' : ''}`
      : v === 'KILLED' ? `${r.tests.length - passed} of ${r.tests.length} tests failed`
      : v === 'TIMEOUT' ? 'inconclusive' : `${r.phase ?? 'no boot'}: ${(r.error ?? '').split('\n')[0].slice(0, 60)}`;
    console.log(`  ${pad(v, 8)} L${pad(String(m.line), 4)} ${pad(m.op, 8)} ${JSON.stringify(m.from.trim() || m.from)} → ${JSON.stringify(m.to)}   ${why}`);
    if (v === 'SURVIVED') console.log(`           ${m.lineText.slice(0, 110)}`);
  }
}

await sweepRunsDir();
const unaccepted = survivors.filter((s) => !s.accepted);
console.log(`\n${tally.KILLED} killed, ${tally.SURVIVED} survived (${unaccepted.length} unaccepted), ` +
  `${tally.TIMEOUT} timed out (inconclusive), ${tally.INVALID} invalid.` +
  (skipped.length ? ` ${skipped.length} lesson(s) of unsupported kinds skipped.` : ''));
if (unaccepted.length) {
  console.log('\nSurvivors are grader gaps: add a test that fails the mutant, or, if it is truly equivalent,');
  console.log(`record it in ${path.relative(repoRoot, acceptedPath)} with a reason.`);
}
process.exit(unaccepted.length ? 1 : 0);

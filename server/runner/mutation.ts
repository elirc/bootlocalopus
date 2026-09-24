/**
 * `mutation` lessons: the learner writes the tests. They are run against the
 * correct implementation, against refactors with identical behaviour
 * ("equivalents": tests that pin implementation details fail these), and
 * against deliberately broken variants ("mutants": each must be caught).
 *
 * Execution is sequential in one worker (one boot, not one per variant). The
 * order is shuffled and the keys are opaque, so a test cannot tell which run
 * it is in. If a variant hangs synchronously, the per-implementation budget
 * kills the worker, that variant is recorded as timed out, and ONE fresh
 * worker runs whatever is left.
 */
import { randomInt } from 'node:crypto';
import type { RunRequest, RunResult, TestResult } from './index.ts';
import { abnormalEnd, budgetFor, createParentLog, runSession, type ImplOutcome } from './session.ts';

type Role =
  | { role: 'correct' }
  | { role: 'equivalent'; n: number }
  | { role: 'mutant'; label: string; i: number };

type Variant = Role & { key: string; code: string };

type Status =
  | { kind: 'ran'; outcome: ImplOutcome }
  | { kind: 'timeout' }
  | { kind: 'crash'; message: string }
  | { kind: 'not-run' };

const DEFAULT_MIN_TESTS = 3;

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const firstFailures = (tests: TestResult[], n = 5) =>
  tests.filter((t) => !t.passed).slice(0, n).map((t) => `  ✗ ${t.name}${t.error ? `: ${t.error.split('\n')[0]}` : ''}`).join('\n');

export async function runMutation(req: RunRequest): Promise<RunResult> {
  const env = req.subjectKind === 'react' ? 'react' : 'js';
  const budget = req.timeoutMs ?? budgetFor(env === 'react' ? 'react' : 'js');
  const minTests = req.minTests ?? DEFAULT_MIN_TESTS;

  const roles: (Role & { code: string })[] = [
    { role: 'correct', code: req.subject ?? '' },
    ...(req.equivalents ?? []).map((code, i) => ({ role: 'equivalent' as const, n: i + 1, code })),
    ...(req.mutants ?? []).map((m, i) => ({ role: 'mutant' as const, label: m.label, i, code: m.code })),
  ];
  const variants: Variant[] = shuffle(roles).map((v, i) => ({ ...v, key: `k${i}` }));
  const correct = variants.find((v) => v.role === 'correct')!;

  const status = new Map<string, Status>();
  const log = createParentLog();
  let ready = false;
  let bootMs: number | undefined;
  let ms = 0;
  let timedOut = false;
  let learnerError: Pick<RunResult, 'error' | 'phase'> | null = null;

  let pending = variants;
  for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
    const out = await runSession({
      kind: 'mutation',
      env,
      code: req.code,
      impls: pending.map((v) => ({ key: v.key, code: v.code })),
      loudKey: correct.key,
      testTimeoutMs: req.testTimeoutMs,
    }, { budgetMs: budget, perImpl: true });
    ms += out.ms;
    for (const l of out.logs) log.push(l.level, l.text);
    if (out.ready && !ready) { ready = true; bootMs = out.bootMs; }

    if (!out.ready) {
      // Never booted: the environment's fault, not the learner's.
      const abnormal = abnormalEnd(out, budget) ?? { error: out.done?.error ?? 'The sandbox failed to start.', phase: out.done?.phase ?? 'boot' };
      return { ok: false, tests: [], logs: log.entries(), ms, ready: false, bootMs, error: abnormal.error, phase: abnormal.phase };
    }
    if (out.end === 'done' && out.done?.error && out.impls.size === 0) {
      // The learner's file failed before any implementation ran (e.g. it did not compile).
      learnerError = { error: out.done.error, phase: out.done.phase };
      break;
    }
    for (const [key, outcome] of out.impls) status.set(key, { kind: 'ran', outcome });
    if (out.end !== 'done' && out.inFlightImpl && !status.has(out.inFlightImpl)) {
      if (out.end === 'timeout') {
        status.set(out.inFlightImpl, { kind: 'timeout' });
        timedOut = true;
      } else {
        status.set(out.inFlightImpl, { kind: 'crash', message: abnormalEnd(out, budget)?.error ?? 'The sandbox crashed.' });
      }
    }
    pending = pending.filter((v) => !status.has(v.key));
    if (out.end === 'done') break;
  }
  for (const v of pending) if (!status.has(v.key)) status.set(v.key, { kind: 'not-run' });

  if (learnerError) {
    return { ok: false, tests: [], logs: log.entries(), ms, ready, bootMs, ...learnerError };
  }

  /* -------------------------------------------------- the verdict rows */

  const passedAll = (s: Status | undefined): { ok: boolean; why?: string; tests: TestResult[] } => {
    if (!s || s.kind === 'not-run') return { ok: false, why: 'not run: the sandbox ran out of time', tests: [] };
    if (s.kind === 'timeout') return { ok: false, why: `timed out after ${budget / 1000}s`, tests: [] };
    if (s.kind === 'crash') return { ok: false, why: s.message, tests: [] };
    const { outcome } = s;
    if (outcome.error) return { ok: false, why: outcome.error, tests: outcome.tests };
    const failing = outcome.tests.filter((t) => !t.passed);
    return failing.length ? { ok: false, why: firstFailures(outcome.tests), tests: outcome.tests } : { ok: true, tests: outcome.tests };
  };

  const c = passedAll(status.get(correct.key));
  let correctRow: TestResult;
  if (!c.ok) {
    correctRow = {
      name: 'passes against a correct implementation',
      passed: false,
      error: 'Your tests must pass against a correct implementation first.\n' + (c.why ?? ''),
    };
  } else if (c.tests.length < minTests) {
    correctRow = {
      name: 'passes against a correct implementation',
      passed: false,
      error: `Write at least ${minTests} tests (found ${c.tests.length}).`,
    };
  } else {
    correctRow = { name: 'passes against a correct implementation', passed: true };
  }
  const judged = correctRow.passed;
  const notJudged = 'not judged until your tests pass against the correct implementation';

  const equivalentRows: TestResult[] = variants
    .filter((v): v is Variant & { role: 'equivalent'; n: number } => v.role === 'equivalent')
    .sort((a, b) => a.n - b.n)
    .map((v) => {
      const name = `passes against refactor #${v.n} (not over-specified)`;
      if (!judged) return { name, passed: false, error: notJudged };
      const r = passedAll(status.get(v.key));
      return r.ok
        ? { name, passed: true }
        : { name, passed: false, error: 'This refactor behaves identically, so a failing test here is pinning implementation details, not behaviour.\n' + (r.why ?? '') };
    });

  let killed = 0;
  const mutantRows: TestResult[] = variants
    .filter((v): v is Variant & { role: 'mutant'; label: string; i: number } => v.role === 'mutant')
    .sort((a, b) => a.i - b.i)
    .map((v) => {
    const m = v;
    const name = `catches: ${m.label}`;
    if (!judged) return { name, passed: false, error: notJudged };
    const s = status.get(v.key);
    if (!s || s.kind === 'not-run') return { name, passed: false, error: 'not run: the sandbox ran out of time' };
    if (s.kind === 'timeout' || s.kind === 'crash') { killed++; return { name, passed: true }; }
    if (s.outcome.phase === 'impl') return { name, passed: false, error: s.outcome.error ?? 'This mutant failed to load (lesson bug).' };
    const caught = !!s.outcome.error || s.outcome.tests.some((t) => !t.passed);
    if (caught) { killed++; return { name, passed: true }; }
    return { name, passed: false, error: 'Your tests let this bug through.' };
  });

  const tests = [correctRow, ...equivalentRows, ...mutantRows];
  const stage: NonNullable<RunResult['mutation']>['stage'] =
    !correctRow.passed ? 'correct'
    : equivalentRows.some((r) => !r.passed) ? 'equivalents'
    : mutantRows.some((r) => !r.passed) ? 'mutants'
    : 'done';
  const ok = tests.every((t) => t.passed);
  const result: RunResult = {
    ok,
    tests,
    logs: log.entries(),
    ms,
    ready,
    mutation: { score: `${killed}/${mutantRows.length}`, stage },
  };
  if (bootMs !== undefined) result.bootMs = bootMs;
  if (timedOut && !ok) result.timedOut = true;
  return result;
}

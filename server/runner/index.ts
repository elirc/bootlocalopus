/**
 * The grader's public entry point: `runExercise(request) → RunResult`.
 *
 * `session.ts` owns the worker and the untrusted-message handling; this file
 * turns what a session collected into a verdict. The verdict is always
 * derived here from the individual rows, never read from the worker.
 */
import type { LessonKind, Mutant } from '../../content/types.ts';
import { abnormalEnd, budgetFor, runSession, seconds, sweepRunsDir, type LogEntry, type SessionOutcome, type TestResult } from './session.ts';
import { runMutation } from './mutation.ts';

export { sweepRunsDir, budgetFor };
export type { TestResult, LogEntry };

export interface RunResult {
  ok: boolean;
  tests: TestResult[];
  logs: { level: string; text: string }[];
  /** Set when we never got as far as running tests, or the run ended abnormally. */
  error?: string;
  phase?: string;
  /** Wall time measured by the parent, spawn to verdict. */
  ms: number;
  /** Spawn to `ready` (environment boot), when the sandbox got that far. */
  bootMs?: number;
  timedOut?: boolean;
  /**
   * The sandbox finished booting and the grading clock was armed. A failure
   * with `ready: false` is the environment's fault and must not be scored.
   */
  ready: boolean;
  /** `mutation` lessons only. */
  mutation?: { score: string; stage: 'correct' | 'equivalents' | 'mutants' | 'done' };
}

export interface RunRequest {
  kind: LessonKind;
  code: string;
  tests?: string;
  fixtures?: string;
  /** `mutation`: the correct implementation, refactors that must also pass, and the bugs to catch. */
  subject?: string;
  equivalents?: string[];
  mutants?: Mutant[];
  subjectKind?: 'js' | 'react' | 'node';
  /** `mutation`: the learner must write at least this many tests (default 3). */
  minTests?: number;
  /** Per-test timeout inside the worker (default 5 s). */
  testTimeoutMs?: number;
  /** `typecheck`: extra ambient types (expensive) and banned syntax in the learner's file. */
  ambient?: ('node' | 'dom')[];
  forbid?: ('as' | 'any')[];
  /** Override the learner budget (per implementation for `mutation`). Used by content verification. */
  timeoutMs?: number;
}

export async function runExercise(req: RunRequest): Promise<RunResult> {
  if (req.kind === 'mutation') return runMutation(req);
  const budget = req.timeoutMs ?? budgetFor(req.kind);
  const out = await runSession({
    kind: req.kind,
    code: req.code,
    tests: req.tests,
    fixtures: req.fixtures,
    testTimeoutMs: req.testTimeoutMs,
    ambient: req.ambient,
    forbid: req.forbid,
  }, { budgetMs: budget });
  return toRunResult(out, budget);
}

function toRunResult(out: SessionOutcome, budget: number): RunResult {
  let tests = out.tests;
  let error = out.done?.error;
  let phase = out.done?.phase;
  let timedOut: boolean | undefined;

  if (out.end === 'timeout' && out.plan) {
    // Keep every row we have; the one in flight timed out; the rest never ran.
    const rows = [...tests];
    for (let i = tests.length; i < out.plan.length; i++) {
      rows.push(i === tests.length
        ? { name: out.plan[i], passed: false, error: `timed out after ${seconds(budget)}`, timedOut: true }
        : { name: out.plan[i], passed: false, error: 'not run' });
    }
    tests = rows;
  }
  const inFlight = out.end === 'timeout' && out.plan ? out.plan[out.tests.length] : null;
  const abnormal = abnormalEnd(out, budget, inFlight);
  if (abnormal) {
    error = abnormal.error;
    phase = abnormal.phase;
    timedOut = abnormal.timedOut || undefined;
  }
  if (out.end === 'done' && !error && tests.length === 0) {
    error = 'The grader reported no results (lesson bug).';
    phase = 'grader';
  }

  const ok = !error && tests.length > 0 && tests.every((t) => t.passed === true);
  const result: RunResult = { ok, tests, logs: out.logs, ms: out.ms, ready: out.ready };
  if (out.bootMs !== undefined) result.bootMs = out.bootMs;
  if (error !== undefined) result.error = error;
  if (phase !== undefined) result.phase = phase;
  if (timedOut) result.timedOut = true;
  return result;
}

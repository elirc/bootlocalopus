import { Worker } from 'node:worker_threads';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { LessonKind } from '../../content/types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');
const WORKER = path.join(here, 'worker.mjs');

/**
 * Run dirs live inside the project so that `import 'react'` from compiled
 * learner code resolves against the project's node_modules.
 */
const RUNS_DIR = path.join(projectRoot, '.runs');

/** Anything still here is debris from a previous process; nothing is durable. */
export const sweepRunsDir = () => rm(RUNS_DIR, { recursive: true, force: true }).catch(() => {});

/**
 * Windows will not unlink a file while the worker still holds a handle on the
 * module it imported, and `terminate()` resolves before the handles are gone.
 * Wait for the worker, then retry with a short backoff.
 */
async function cleanupRunDir(dir: string, terminated: Promise<unknown> | null) {
  await terminated?.catch(() => {});
  for (const delay of [0, 50, 150, 400, 1000]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      // Still locked; try again after a longer pause.
    }
  }
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  ms?: number;
}

export interface RunResult {
  ok: boolean;
  tests: TestResult[];
  logs: { level: string; text: string }[];
  /** Set when we never got as far as running tests. */
  error?: string;
  phase?: string;
  ms: number;
  timedOut?: boolean;
}

export interface RunRequest {
  kind: LessonKind;
  code: string;
  tests?: string;
  fixtures?: string;
  /** Override the per-kind budget. Used by content verification. */
  timeoutMs?: number;
}

/** SQL needs to boot a Postgres WASM instance, so it gets a longer leash. */
const timeoutFor = (kind: LessonKind) =>
  kind === 'sql' ? 25_000 : kind === 'react' || kind === 'typecheck' ? 20_000 : 10_000;

export async function runExercise(req: RunRequest): Promise<RunResult> {
  const dir = path.join(RUNS_DIR, randomUUID());
  await mkdir(dir, { recursive: true });
  const started = Date.now();
  const budget = req.timeoutMs ?? timeoutFor(req.kind);

  let terminated: Promise<unknown> | null = null;

  try {
    return await new Promise<RunResult>((resolve) => {
      const worker = new Worker(WORKER, {
        workerData: { ...req, dir },
        // Learner code should not be able to read the progress file or spawn things.
        env: { NODE_ENV: 'sandbox' },
        resourceLimits: { maxOldGenerationSizeMb: 512 },
        stdout: true,
        stderr: true,
      });

      let settled = false;
      let inFlight: string | null = null;
      const finish = (r: RunResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        terminated = worker.terminate();
        resolve(r);
      };

      const timer = setTimeout(() => {
        finish({
          ok: false,
          tests: [],
          logs: [],
          timedOut: true,
          ms: Date.now() - started,
          error:
            `Timed out after ${budget / 1000}s` +
            (inFlight ? ` while running "${inFlight}"` : '') +
            `. An infinite loop, an await that never settles, or a server you ` +
            `never closed are the usual causes.`,
        });
      }, budget);

      worker.on('message', (msg: RunResult & { progress?: string }) => {
        if (msg.progress) {
          inFlight = msg.progress;
          return;
        }
        finish({ ...msg, ms: msg.ms ?? Date.now() - started });
      });
      worker.on('error', (err) =>
        finish({
          ok: false,
          tests: [],
          logs: [],
          ms: Date.now() - started,
          error: `Sandbox error: ${err.message}`,
        }),
      );
      worker.on('exit', (code) => {
        if (code !== 0) {
          finish({
            ok: false,
            tests: [],
            logs: [],
            ms: Date.now() - started,
            error: `The sandbox exited early with code ${code}. Did your code call process.exit()?`,
          });
        }
      });
    });
  } finally {
    // Fire and forget: the learner should not wait on filesystem cleanup.
    void cleanupRunDir(dir, terminated);
  }
}

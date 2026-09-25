/**
 * One sandbox worker, from spawn to termination, seen from the parent.
 *
 * The parent is the trust boundary. The worker ran learner code, so every
 * message it sends is untrusted data: it arrives on a private MessagePort
 * (the ordinary parentPort is never read), every field is normalised to its
 * declared type, nothing it says about `ok` or `ms` is used, and no message
 * can make a listener here throw.
 */
import { MessageChannel, Worker } from 'node:worker_threads';
import { mkdir, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { LessonKind } from '../../content/types.ts';
import type { RunResult } from './index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '..', '..');
const WORKER = path.join(here, 'worker.mjs');

/**
 * Run dirs live inside the project so that `import 'react'` from compiled
 * learner code resolves against the project's node_modules. Each process
 * owns a subtree, so a sweep can never delete another process's live run.
 */
const RUNS_ROOT = path.join(projectRoot, '.runs');
const RUNS_DIR = path.join(RUNS_ROOT, String(process.pid));
const STALE_MS = 60 * 60_000;

/** How long the worker may take to boot (imports, jsdom, PGlite, tsc libs) before we give up on it. */
export const BOOT_BUDGET_MS = 60_000;

const MAX_LOG_ENTRIES = 200;
const MAX_LOG_CHARS = 64_000;
const MAX_TESTS = 500;

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  ms?: number;
  timedOut?: boolean;
}

export interface LogEntry { level: 'log' | 'warn' | 'error'; text: string }

export interface ImplOutcome { tests: TestResult[]; error?: string; phase?: string }

export interface SessionOutcome {
  end: 'done' | 'timeout' | 'boot-timeout' | 'exit' | 'error';
  ready: boolean;
  bootMs?: number;
  ms: number;
  plan: string[] | null;
  tests: TestResult[];
  logs: LogEntry[];
  done: { error?: string; phase?: string } | null;
  /** mutation: results per implementation key, and the key running when the session ended. */
  impls: Map<string, ImplOutcome>;
  inFlightImpl: string | null;
  exitCode?: number;
  errorMessage?: string;
  oom?: boolean;
}

/** Remove run trees from dead processes, and anything older than an hour. */
export async function sweepRunsDir() {
  let entries: string[] = [];
  try {
    entries = await readdir(RUNS_ROOT);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(RUNS_ROOT, entry);
    const pid = Number(entry);
    const ours = pid === process.pid;
    let old = false;
    try {
      old = Date.now() - (await stat(full)).mtimeMs > STALE_MS;
    } catch { /* gone already */ }
    if (ours && !old) continue;
    if (Number.isInteger(pid) && !ours && isAlive(pid) && !old) continue;
    await rm(full, { recursive: true, force: true }).catch(() => {});
  }
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * `terminate()` resolves before Windows has released every handle the worker
 * held, so wait for it, then retry with a short backoff.
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

const str = (v: unknown, max: number): string => {
  const s = typeof v === 'string' ? v : String(v);
  return s.length > max ? s.slice(0, max) : s;
};

export function normTest(x: unknown): TestResult | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  const out: TestResult = { name: str(r.name, 200), passed: r.passed === true };
  if (r.error != null) out.error = str(r.error, 4000);
  if (typeof r.ms === 'number' && Number.isFinite(r.ms)) out.ms = r.ms;
  return out;
}

export function normTests(list: unknown): TestResult[] {
  if (!Array.isArray(list)) return [];
  const out: TestResult[] = [];
  for (const x of list.slice(0, MAX_TESTS)) {
    const t = normTest(x);
    if (t) out.push(t);
  }
  return out;
}

/** A capped log that re-applies the limits the worker is only advised to respect. */
export function createParentLog() {
  const logs: LogEntry[] = [];
  let chars = 0;
  let dropped = 0;
  return {
    push(level: unknown, text: unknown) {
      const lv: LogEntry['level'] = level === 'warn' || level === 'error' ? level : 'log';
      let t: string;
      try { t = str(text, 2_000); } catch { t = '[unprintable]'; }
      if (logs.length >= MAX_LOG_ENTRIES || chars + t.length > MAX_LOG_CHARS) {
        dropped++;
        return;
      }
      chars += t.length;
      logs.push({ level: lv, text: t });
    },
    addDropped(n: number) {
      if (Number.isFinite(n) && n > 0) dropped += Math.min(n, 1e9);
    },
    entries(): LogEntry[] {
      return dropped
        ? [...logs, { level: 'warn', text: `… ${dropped.toLocaleString()} more log entr${dropped === 1 ? 'y' : 'ies'} not shown (output is capped at ${MAX_LOG_ENTRIES} entries / ${MAX_LOG_CHARS.toLocaleString()} characters)` }]
        : logs;
    },
  };
}

export interface SessionOptions {
  /** Learner budget, armed at `ready`. */
  budgetMs: number;
  /** mutation: re-arm the budget at every `impl-start`, so it is per implementation. */
  perImpl?: boolean;
}

/**
 * Spawn a worker for `data` and collect what it reports until it posts
 * `done`, runs out of time, exits or crashes. Never rejects.
 */
export async function runSession(data: Record<string, unknown>, opts: SessionOptions): Promise<SessionOutcome> {
  const dir = path.join(RUNS_DIR, randomUUID());
  // The worker gets no inherited environment, so give it a temp dir of its own
  // (inside the run dir, removed with it): otherwise os.tmpdir() is
  // "undefined\temp" on Windows, relative to the server's cwd.
  const tmp = path.join(dir, 'tmp');
  await mkdir(tmp, { recursive: true });
  const started = Date.now();
  let terminated: Promise<unknown> | null = null;

  try {
    return await new Promise<SessionOutcome>((resolve) => {
      const { port1, port2 } = new MessageChannel();
      const worker = new Worker(WORKER, {
        workerData: { ...data, dir, projectRoot, port: port2 },
        transferList: [port2],
        // A bare Node: no tsx loader hooks inherited from the server process
        // (they made runs hang intermittently).
        execArgv: [],
        env: { NODE_ENV: 'sandbox', TMPDIR: tmp, TMP: tmp, TEMP: tmp },
        resourceLimits: { maxOldGenerationSizeMb: 512 },
        stdout: true,
        stderr: true,
      });

      const log = createParentLog();
      const out: SessionOutcome = {
        end: 'done', ready: false, ms: 0, plan: null, tests: [], logs: [], done: null,
        impls: new Map(), inFlightImpl: null,
      };
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const finish = (end: SessionOutcome['end'], extra: Partial<SessionOutcome> = {}) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { port1.close(); } catch { /* ignore */ }
        terminated = worker.terminate();
        Object.assign(out, extra);
        out.end = end;
        out.ms = Date.now() - started;
        out.logs = log.entries();
        resolve(out);
      };

      const armBudget = () => {
        clearTimeout(timer);
        timer = setTimeout(() => finish('timeout'), opts.budgetMs);
      };

      timer = setTimeout(() => finish('boot-timeout'), BOOT_BUDGET_MS);

      const handle = (m: unknown) => {
        if (settled || !m || typeof m !== 'object') return;
        const msg = m as Record<string, unknown>;
        if (typeof msg.t !== 'string') return;
        switch (msg.t) {
          case 'ready':
            if (out.ready) return;
            out.ready = true;
            out.bootMs = Date.now() - started;
            armBudget();
            return;
          case 'plan':
            if (Array.isArray(msg.names)) out.plan = msg.names.slice(0, MAX_TESTS).map((n) => str(n, 200));
            return;
          case 'test': {
            const t = normTest(msg.result);
            if (t && out.tests.length < MAX_TESTS) out.tests.push(t);
            return;
          }
          case 'log': {
            const e = msg.entry as Record<string, unknown> | null;
            if (e && typeof e === 'object') log.push(e.level, e.text);
            return;
          }
          case 'impl-start':
            out.inFlightImpl = str(msg.key, 50);
            if (opts.perImpl && out.ready) armBudget();
            return;
          case 'impl': {
            const key = str(msg.key, 50);
            out.impls.set(key, {
              tests: normTests(msg.tests),
              error: msg.error == null ? undefined : str(msg.error, 4000),
              phase: msg.phase == null ? undefined : str(msg.phase, 20),
            });
            if (out.inFlightImpl === key) out.inFlightImpl = null;
            return;
          }
          case 'done':
            if (typeof msg.droppedLogs === 'number') log.addDropped(msg.droppedLogs);
            finish('done', {
              done: {
                error: msg.error == null ? undefined : str(msg.error, 4000),
                phase: msg.phase == null ? undefined : str(msg.phase, 20),
              },
            });
            return;
        }
      };

      // The public parentPort is learner-reachable; never read it.
      worker.on('message', () => {});
      worker.on('messageerror', () => {});
      port1.on('message', (m) => {
        try { handle(m); } catch { /* malformed: ignore */ }
      });
      port1.on('messageerror', () => {});
      // Direct writes to process.stdout/stderr inside the worker land here.
      worker.stdout?.on('data', (chunk) => { try { log.push('log', String(chunk).replace(/\n$/, '')); } catch { /* ignore */ } });
      worker.stderr?.on('data', (chunk) => { try { log.push('error', String(chunk).replace(/\n$/, '')); } catch { /* ignore */ } });
      worker.on('error', (err) => {
        const oom = (err as NodeJS.ErrnoException)?.code === 'ERR_WORKER_OUT_OF_MEMORY';
        finish('error', { errorMessage: oom ? 'Your code used more than 512 MB of memory.' : `Sandbox error: ${err?.message ?? err}`, oom });
      });
      // Any exit before `done` is an early exit, code 0 included.
      worker.on('exit', (code) => finish('exit', { exitCode: code }));
    });
  } finally {
    // Fire and forget: the learner should not wait on filesystem cleanup.
    void cleanupRunDir(dir, terminated);
  }
}

/** The learner's budget, armed when the sandbox reports ready. Unchanged values; boot has its own clock. */
export const budgetFor = (kind: LessonKind): number =>
  kind === 'sql' || kind === 'node-db' ? 25_000
  : kind === 'react' || kind === 'typecheck' ? 20_000
  : 10_000;

export const seconds = (ms: number) => `${Math.round(ms / 100) / 10}s`;

/** Shared ending messages, used by the mutation kind as well. */
export function abnormalEnd(out: SessionOutcome, budget: number, inFlight?: string | null): Pick<RunResult, 'error' | 'phase' | 'timedOut'> | null {
  switch (out.end) {
    case 'boot-timeout':
      return { error: 'The grader took too long to start (this is not your code). Try again.', phase: 'boot', timedOut: false };
    case 'timeout':
      return {
        error: `Timed out after ${seconds(budget)}` + (inFlight ? ` while running "${inFlight}"` : '') +
          '. An infinite loop, an await that never settles, or a server you never closed are the usual causes.',
        timedOut: true,
      };
    case 'exit':
      return {
        error: out.exitCode === 0
          ? 'Your code ended the sandbox (process.exit()) before the tests finished.'
          : `The sandbox exited with code ${out.exitCode} before the tests finished.`,
        phase: 'exit',
      };
    case 'error':
      return { error: out.errorMessage ?? 'The sandbox crashed.', phase: out.oom ? 'memory' : 'crash' };
    default:
      return null;
  }
}


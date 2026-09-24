/**
 * Grading sandbox. Runs in a worker_thread so a runaway loop or a top-level
 * throw in learner code can be killed without taking the API down.
 *
 * Order matters, and is the whole design:
 *   1. copy workerData into this closure, then scrub it;
 *   2. environment setup (jsdom / PGlite / the tsc program) — not the learner's time;
 *   3. import policy + process lock + locked harness globals;
 *   4. post `ready` — the parent starts the learner's clock now;
 *   5. compile and import learner code, import the spec, run, stream rows;
 *   6. post `done`.
 *
 * Trust: learner code shares this thread, so nothing here is a boundary. The
 * result channel is a MessagePort only this closure holds; the harness
 * globals are locked; the trusted core uses captured builtins. The parent
 * treats every message as untrusted data and derives the verdict itself.
 *
 * Protocol (worker -> parent, on the private port only):
 *   { t: 'ready', bootMs } { t: 'plan', names } { t: 'test', result } { t: 'log', entry }
 *   { t: 'impl-start', key } { t: 'impl', key, tests, error?, phase? }   (mutation kind)
 *   { t: 'done', error?, phase?, droppedLogs? }
 */
import { workerData, MessagePort } from 'node:worker_threads';
import * as P from './sandbox/primordials.mjs';
import { createLogSink } from './sandbox/format.mjs';
import { createHarness, describeError } from './sandbox/harness.mjs';
import { transpile, emit, unemit } from './sandbox/compile.mjs';
import { lockProcess, installImportPolicy, defineLocked, defineLockedAccessor, SandboxExit } from './sandbox/guard.mjs';
import { bail } from './sandbox/expect.mjs';

/* ------------------------------------------------ 1. take the descriptor */

const job = {
  kind: workerData.kind,
  code: workerData.code,
  tests: workerData.tests,
  fixtures: workerData.fixtures,
  dir: workerData.dir,
  projectRoot: workerData.projectRoot,
  testTimeoutMs: workerData.testTimeoutMs,
  ambient: workerData.ambient,
  forbid: workerData.forbid,
  // mutation
  env: workerData.env,
  impls: workerData.impls,
  loudKey: workerData.loudKey,
};
const port = workerData.port;
for (const k of Object.keys(workerData)) delete workerData[k];

const PortPostMessage = P.uncurry(MessagePort.prototype.postMessage);
const post = (m) => {
  try { PortPostMessage(port, m); } catch { /* unclonable: drop */ }
};
const bootStarted = P.DateNow();

/**
 * Node unref's the timer behind `AbortSignal.timeout()`, and without a ref'd
 * handle the worker's loop can run dry and exit while such a timer is
 * pending. A ref'd interval keeps the loop alive until the parent ends us.
 */
setInterval(() => {}, 20);

/* ------------------------------------------------------------- logging */

const sink = createLogSink({ onEntry: (entry) => post({ t: 'log', entry }) });
for (const [name, level] of [['log', 'log'], ['info', 'log'], ['debug', 'log'], ['warn', 'warn'], ['error', 'error']]) {
  console[name] = (...args) => sink.push(level, args);
}

let harness = null;
process.on('unhandledRejection', (reason) => {
  if (harness && harness.reportUncaught(reason)) return;
  sink.pushText('error', 'Unhandled rejection: ' + describeError(reason));
});
process.on('uncaughtException', (err) => {
  if (harness && harness.reportUncaught(err)) return;
  sink.pushText('error', 'Uncaught exception: ' + describeError(err));
});

/* -------------------------------------------------- harness globals */

const perTestTimeoutMs = P.NumberIsFinite(job.testTimeoutMs) && job.testTimeoutMs > 0 ? job.testTimeoutMs : 5_000;
const newHarness = (opts = {}) => createHarness({
  perTestTimeoutMs,
  onLog: (level, text) => sink.pushText(level, text),
  ...opts,
});

/**
 * The globals delegate to whichever harness is current, so the mutation kind
 * can give each implementation a fresh one behind the same locked names.
 */
const delegate = (name) => (...args) => harness.api[name](...args);
function harnessGlobals() {
  const expect = (actual) => harness.expect(actual);
  return {
    describe: delegate('describe'),
    it: delegate('it'),
    test: delegate('test'),
    beforeEach: delegate('beforeEach'),
    afterEach: delegate('afterEach'),
    beforeAll: delegate('beforeAll'),
    afterAll: delegate('afterAll'),
    expect: P.ObjectFreeze(expect),
    assert: (cond, msg = 'assertion failed') => { if (!cond) bail(msg); },
    fail: (msg = 'failed') => bail(msg),
    /** Postgres values sometimes arrive as bigint or string; force a number. */
    num: (v) => (typeof v === 'bigint' ? Number(v) : typeof v === 'string' ? Number(v) : v),
  };
}

let solution = undefined;

/* ----------------------------------------------------------- helpers */

const done = (extra = {}) => ({ t: 'done', droppedLogs: sink.dropped(), ...extra });

function loadError(e) {
  if (SandboxExit.is(e)) return { phase: 'exit', error: 'Your code called process.exit(). Graded code must not end the process.' };
  const detail = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join('\n') : String((e && e.message) || e);
  return { phase: 'load', error: 'Your code threw while loading.\n' + detail };
}

/** A namespace whose functions all print the same source, so tests cannot fingerprint which implementation they got. */
function wrapExports(ns) {
  const out = {};
  for (const [k, v] of P.ObjectEntries(ns)) {
    if (typeof v !== 'function' || /^class\b/.test(P.FunctionPrototypeToString(v))) {
      out[k] = v;
      continue;
    }
    const wrapped = function (...a) {
      return new.target ? P.ReflectConstruct(v, a, new.target) : P.ReflectApply(v, this, a);
    };
    try { P.ObjectDefineProperty(wrapped, 'name', { value: v.name }); } catch { /* ignore */ }
    out[k] = wrapped;
  }
  return P.ObjectFreeze(out);
}

async function runHarness() {
  return harness.run({
    onPlan: (names) => post({ t: 'plan', names }),
    onTest: (result) => post({ t: 'test', result }),
  });
}

/* -------------------------------------------------------------- kinds */

async function runTypecheck() {
  const { createTypecheckProgram, typecheckRows } = await import('./envs/typecheck.mjs');
  const prog = createTypecheckProgram({ code: job.code, tests: job.tests, dir: job.dir, ambient: job.ambient || [] });
  post({ t: 'ready', bootMs: P.DateNow() - bootStarted });
  const rows = typecheckRows(prog, { forbid: job.forbid || [] });
  post({ t: 'plan', names: rows.map((r) => r.name) });
  for (const result of rows) post({ t: 'test', result });
  return done();
}

async function setupEnv(envKind) {
  if (envKind === 'react') {
    const { setupDom } = await import('./envs/dom.mjs');
    return setupDom();
  }
  if (envKind === 'sql' || envKind === 'node-db') {
    const { setupPostgres } = await import('./envs/postgres.mjs');
    return setupPostgres({ fixtures: job.fixtures, code: job.code, mode: envKind });
  }
  return { globals: {}, attach() {} };
}

/** Steps 3 and 4: policy, process lock, locked globals, then `ready`. */
function lockDown(env, { withSolution, withSubject }) {
  installImportPolicy({ runDir: job.dir, projectRoot: job.projectRoot });
  lockProcess();
  defineLocked(globalThis, harnessGlobals());
  defineLocked(globalThis, env.globals || {});
  for (const [name, acc] of P.ObjectEntries(env.accessors || {})) defineLockedAccessor(globalThis, name, acc.get, acc.set);
  if (withSolution) defineLockedAccessor(globalThis, 'solution', () => solution);
  if (withSubject) defineLockedAccessor(globalThis, 'subject', () => solution);
  post({ t: 'ready', bootMs: P.DateNow() - bootStarted });
}

async function runGraded() {
  const kind = job.kind;
  const jsx = kind === 'react';
  const isSql = kind === 'sql';

  let env;
  try {
    env = await setupEnv(kind);
  } catch (e) {
    return done({ phase: 'fixture', error: 'Could not prepare the environment: ' + ((e && e.message) || String(e)) });
  }
  harness = newHarness();
  env.attach(harness);
  lockDown(env, { withSolution: !isSql, withSubject: false });

  if (isSql) {
    const problem = await env.afterReady();
    if (problem) return done({ phase: 'load', error: problem });
  } else {
    let url;
    try {
      url = await emit(job.dir, 'solution.mjs', transpile(job.code, jsx ? 'solution.tsx' : 'solution.ts', { jsx }));
    } catch (e) {
      return done({ phase: 'compile', error: 'Your code did not compile.\n' + ((e && e.message) || String(e)) });
    }
    try {
      solution = await import(url);
    } catch (e) {
      return done(loadError(e));
    }
  }

  try {
    const specUrl = await emit(job.dir, 'spec.mjs', transpile(job.tests || '', jsx ? 'spec.tsx' : 'spec.ts', { jsx }));
    await import(specUrl);
  } catch (e) {
    return done({ phase: 'grader', error: 'The grader failed to load (lesson bug): ' + ((e && e.message) || String(e)) });
  }

  if (!harness.registeredCount()) return done({ phase: 'grader', error: 'The grader registered no tests (lesson bug).' });
  await runHarness();
  if (env.dirty && env.dirty()) return done({ phase: 'grader' });
  return done();
}

/**
 * Mutation: the learner's code is a test file. Run it against every
 * implementation in the order the parent chose (keys are opaque), each with
 * a fresh harness and a fresh instance of the spec module.
 */
async function runMutation() {
  const envKind = job.env === 'react' ? 'react' : 'js';
  const jsx = envKind === 'react';
  let env;
  try {
    env = await setupEnv(envKind);
  } catch (e) {
    return done({ phase: 'fixture', error: 'Could not prepare the environment: ' + ((e && e.message) || String(e)) });
  }
  harness = newHarness({ requireAssertions: true });
  lockDown(env, { withSolution: true, withSubject: true });

  let specUrl;
  try {
    specUrl = await emit(job.dir, 'spec.mjs', transpile(job.code, jsx ? 'spec.tsx' : 'spec.ts', { jsx }));
  } catch (e) {
    return done({ phase: 'compile', error: 'Your tests did not compile.\n' + ((e && e.message) || String(e)) });
  }

  for (const impl of job.impls || []) {
    const key = String(impl.key);
    post({ t: 'impl-start', key });
    sink.quiet = key !== job.loudKey;
    harness = newHarness({ requireAssertions: true });
    env.attach(harness);
    solution = undefined;

    let implUrl;
    try {
      implUrl = await emit(job.dir, `impl-${key}.mjs`, transpile(impl.code, jsx ? 'impl.tsx' : 'impl.ts', { jsx }));
      const ns = await import(implUrl);
      solution = wrapExports(ns);
    } catch (e) {
      post({ t: 'impl', key, tests: [], phase: 'impl', error: 'This implementation failed to load (lesson bug): ' + ((e && e.message) || String(e)) });
      continue;
    } finally {
      if (implUrl) await unemit(implUrl);
    }

    try {
      await import(specUrl + '?impl=' + key);
    } catch (e) {
      const le = loadError(e);
      post({ t: 'impl', key, tests: [], phase: le.phase, error: 'Your tests threw while loading.\n' + le.error.replace(/^Your code threw while loading\.\n/, '') });
      continue;
    }
    if (!harness.registeredCount()) {
      post({ t: 'impl', key, tests: [], phase: 'load', error: 'Your file registered no tests: use it() / test().' });
      continue;
    }
    const tests = await harness.run();
    post({ t: 'impl', key, tests });
  }
  sink.quiet = false;
  return done();
}

/* --------------------------------------------------------------- main */

async function main() {
  if (job.kind === 'typecheck') return runTypecheck();
  if (job.kind === 'mutation') return runMutation();
  return runGraded();
}

main().then(
  (msg) => post(msg),
  (e) => post(done({ phase: 'crash', error: 'Sandbox crashed: ' + ((e && e.message) || String(e)) })),
);

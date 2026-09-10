/**
 * Grading sandbox. Runs in a worker_thread so a runaway loop or a top-level
 * throw in learner code can be killed without taking the API down.
 *
 * The parent creates `dir`, then sends us a descriptor. We compile, wire up an
 * environment for the lesson kind, expose a small test harness as globals, then
 * import the spec and run whatever it registered.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const { kind, code, tests, fixtures, dir } = workerData;

/**
 * Node unref's the timer behind `AbortSignal.timeout()`, and an unref'd timer
 * alone never wakes a worker's event loop — so without this heartbeat, any
 * learner code awaiting `AbortSignal.timeout()` would hang until the parent
 * kills us. A ref'd interval keeps the loop turning so those timers fire.
 */
const keepAlive = setInterval(() => {}, 20);

/**
 * A stray rejection or throw from a timer that fires after its test finished
 * would otherwise kill the worker and lose every result we had collected.
 * Record them so they show up in the output, but keep running.
 */
process.on('unhandledRejection', (reason) => {
  logs.push({ level: 'error', text: 'Unhandled rejection: ' + ((reason && reason.message) || String(reason)) });
});
process.on('uncaughtException', (err) => {
  logs.push({ level: 'error', text: 'Uncaught exception: ' + ((err && err.message) || String(err)) });
});

/* ------------------------------------------------------------------ logging */

const logs = [];
const MAX_LOGS = 200;
const fmt = (a) => {
  if (typeof a === 'string') return a;
  try {
    return JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v), 2);
  } catch {
    return String(a);
  }
};
const capture = (level) => (...args) => {
  if (logs.length < MAX_LOGS) logs.push({ level, text: args.map(fmt).join(' ') });
};
console.log = capture('log');
console.info = capture('log');
console.warn = capture('warn');
console.error = capture('error');
console.debug = capture('log');

/* ------------------------------------------------------------- deep compare */

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    try { return BigInt(a) === BigInt(b); } catch { return false; }
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) { if (!b.has(k) || !deepEqual(v, b.get(k))) return false; }
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    const bs = [...b];
    return [...a].every((v) => bs.some((w) => deepEqual(v, w)));
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

/** Every key in `subset` matches in `obj`, recursively. Extra keys ignored. */
function subsetEqual(obj, subset) {
  if (subset === null || typeof subset !== 'object') return deepEqual(obj, subset);
  if (obj === null || typeof obj !== 'object') return false;
  if (Array.isArray(subset)) {
    return Array.isArray(obj) && subset.length === obj.length &&
      subset.every((v, i) => subsetEqual(obj[i], v));
  }
  return Object.keys(subset).every((k) => subsetEqual(obj[k], subset[k]));
}

const show = (v) => {
  if (v === undefined) return 'undefined';
  if (typeof v === 'bigint') return v + 'n';
  if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
  if (typeof v === 'symbol') return v.toString();
  if (v instanceof Error) return v.name + ': ' + v.message;
  try {
    const s = JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x + 'n' : x));
    if (s === undefined) return String(v);
    return s.length > 700 ? s.slice(0, 700) + '…' : s;
  } catch {
    return String(v);
  }
};

class AssertionError extends Error {
  constructor(message) { super(message); this.name = 'AssertionError'; }
}
const bail = (msg) => { throw new AssertionError(msg); };

/* ----------------------------------------------------------------- expect() */

function makeExpect(actual, negated) {
  const who = show(actual);
  const check = (pass, expl, negExpl) => {
    if (negated ? pass : !pass) bail(negated ? negExpl : expl);
  };
  const api = {
    toBe(exp) {
      check(Object.is(actual, exp),
        'expected ' + who + ' to be ' + show(exp),
        'expected ' + who + ' NOT to be ' + show(exp));
    },
    toEqual(exp) {
      check(deepEqual(actual, exp),
        'expected ' + who + '\n  to deeply equal ' + show(exp),
        'expected ' + who + ' NOT to deeply equal ' + show(exp));
    },
    toMatchObject(exp) {
      check(subsetEqual(actual, exp),
        'expected ' + who + '\n  to match ' + show(exp),
        'expected ' + who + ' NOT to match ' + show(exp));
    },
    toBeTruthy() { check(!!actual, 'expected ' + who + ' to be truthy', 'expected ' + who + ' to be falsy'); },
    toBeFalsy() { check(!actual, 'expected ' + who + ' to be falsy', 'expected ' + who + ' to be truthy'); },
    toBeNull() { check(actual === null, 'expected ' + who + ' to be null', 'expected ' + who + ' not to be null'); },
    toBeUndefined() { check(actual === undefined, 'expected ' + who + ' to be undefined', 'expected ' + who + ' to be defined'); },
    toBeDefined() { check(actual !== undefined, 'expected value to be defined', 'expected value to be undefined'); },
    toBeNaN() { check(Number.isNaN(actual), 'expected ' + who + ' to be NaN', 'expected ' + who + ' not to be NaN'); },
    toBeTypeOf(t) {
      check(typeof actual === t,
        'expected typeof value to be "' + t + '", got "' + typeof actual + '"',
        'expected typeof value not to be "' + t + '"');
    },
    toBeInstanceOf(C) {
      check(actual instanceof C,
        'expected ' + who + ' to be an instance of ' + (C && C.name),
        'expected ' + who + ' not to be an instance of ' + (C && C.name));
    },
    toContain(item) {
      const pass = typeof actual === 'string'
        ? actual.includes(item)
        : Array.isArray(actual) || actual instanceof Set
          ? [...actual].includes(item)
          : false;
      check(pass, 'expected ' + who + ' to contain ' + show(item), 'expected ' + who + ' not to contain ' + show(item));
    },
    toContainEqual(item) {
      const pass = Array.isArray(actual) && actual.some((v) => deepEqual(v, item));
      check(pass, 'expected ' + who + ' to contain an item equal to ' + show(item),
        'expected ' + who + ' not to contain ' + show(item));
    },
    toHaveLength(n) {
      check(actual != null && actual.length === n,
        'expected length ' + n + ', got ' + (actual == null ? 'a value with no length' : actual.length),
        'expected length not to be ' + n);
    },
    toHaveProperty(key, ...rest) {
      const parts = String(key).split('.');
      let cur = actual, found = true;
      for (const p of parts) {
        if (cur == null || !(p in cur)) { found = false; break; }
        cur = cur[p];
      }
      const pass = found && (rest.length === 0 || deepEqual(cur, rest[0]));
      check(pass,
        'expected value to have property "' + key + '"' +
          (rest.length ? ' equal to ' + show(rest[0]) + ' (got ' + show(cur) + ')' : ''),
        'expected value not to have property "' + key + '"');
    },
    toBeGreaterThan(n) { check(actual > n, 'expected ' + who + ' > ' + n, 'expected ' + who + ' not > ' + n); },
    toBeGreaterThanOrEqual(n) { check(actual >= n, 'expected ' + who + ' >= ' + n, 'expected ' + who + ' not >= ' + n); },
    toBeLessThan(n) { check(actual < n, 'expected ' + who + ' < ' + n, 'expected ' + who + ' not < ' + n); },
    toBeLessThanOrEqual(n) { check(actual <= n, 'expected ' + who + ' <= ' + n, 'expected ' + who + ' not <= ' + n); },
    toBeCloseTo(n, digits = 2) {
      const pass = Math.abs(actual - n) < Math.pow(10, -digits) / 2;
      check(pass, 'expected ' + who + ' to be close to ' + n, 'expected ' + who + ' not to be close to ' + n);
    },
    toMatch(re) {
      const pass = typeof re === 'string' ? String(actual).includes(re) : re.test(String(actual));
      check(pass, 'expected ' + who + ' to match ' + re, 'expected ' + who + ' not to match ' + re);
    },
    toThrow(expected) {
      if (typeof actual !== 'function') bail('expect(...).toThrow() needs a function to call');
      let threw = false, err;
      try { actual(); } catch (e) { threw = true; err = e; }
      if (negated) {
        if (threw) bail('expected the function not to throw, but it threw ' + show(err));
        return;
      }
      if (!threw) bail('expected the function to throw, but it returned normally');
      if (expected !== undefined) matchError(err, expected);
    },
  };
  api.toStrictEqual = api.toEqual;
  api.toThrowError = api.toThrow;
  return api;
}

function matchError(err, expected) {
  const msg = err instanceof Error ? err.message : String(err);
  if (typeof expected === 'string') {
    if (!msg.includes(expected)) bail('expected the error message to include "' + expected + '", got "' + msg + '"');
  } else if (expected instanceof RegExp) {
    if (!expected.test(msg)) bail('expected the error message to match ' + expected + ', got "' + msg + '"');
  } else if (typeof expected === 'function') {
    if (!(err instanceof expected)) bail('expected the error to be an instance of ' + expected.name + ', got ' + show(err));
  }
}

function expect(actual) {
  const base = makeExpect(actual, false);
  base.not = makeExpect(actual, true);
  base.rejects = {
    async toThrow(expected) {
      let value, err, threw = false;
      try { value = await (typeof actual === 'function' ? actual() : actual); }
      catch (e) { threw = true; err = e; }
      if (!threw) bail('expected the promise to reject, but it resolved with ' + show(value));
      if (expected !== undefined) matchError(err, expected);
    },
  };
  base.rejects.toThrowError = base.rejects.toThrow;
  base.resolves = {
    async toEqual(exp) {
      const v = await (typeof actual === 'function' ? actual() : actual);
      if (!deepEqual(v, exp)) bail('expected the resolved value ' + show(v) + ' to equal ' + show(exp));
    },
    async toBe(exp) {
      const v = await (typeof actual === 'function' ? actual() : actual);
      if (!Object.is(v, exp)) bail('expected the resolved value ' + show(v) + ' to be ' + show(exp));
    },
  };
  return base;
}

/* ------------------------------------------------------------- test harness */

/**
 * Hooks are scoped to the `describe` that declared them, the way every real
 * runner does it. A flat list would run a nested suite's setup before every
 * test in the file, which silently breaks any lesson whose suites set up
 * conflicting state.
 */
const rootSuite = { name: null, before: [], after: [], parent: null };
let currentSuite = rootSuite;
const registered = [];

function describe(name, fn) {
  const suite = { name, before: [], after: [], parent: currentSuite };
  const previous = currentSuite;
  currentSuite = suite;
  try {
    fn();
  } finally {
    currentSuite = previous;
  }
}

function it(name, fn) {
  const chain = [];
  for (let suite = currentSuite; suite; suite = suite.parent) chain.unshift(suite);
  const path = chain.map((s) => s.name).filter(Boolean);
  registered.push({ name: [...path, name].join(' › '), fn, chain });
}

const beforeEach = (fn) => currentSuite.before.push(fn);
const afterEach = (fn) => currentSuite.after.push(fn);

/** Outermost-first for setup, innermost-first for teardown. */
const hooksFor = (test) => ({
  before: test.chain.flatMap((suite) => suite.before),
  after: [...test.chain].reverse().flatMap((suite) => suite.after),
});

Object.assign(globalThis, {
  describe, it, test: it, beforeEach, afterEach, expect,
  assert: (cond, msg = 'assertion failed') => { if (!cond) bail(msg); },
  fail: (msg = 'failed') => bail(msg),
  /** Postgres values sometimes arrive as bigint or string; force a number. */
  num: (v) => (typeof v === 'bigint' ? Number(v) : typeof v === 'string' ? Number(v) : v),
});

/* --------------------------------------------------------------- compiling */

function compile(source, file, jsx) {
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    esModuleInterop: true,
    allowJs: true,
    useDefineForClassFields: false,
  };
  // `jsx` must be omitted entirely for non-JSX input; passing JsxEmit.None is
  // rejected by tsc as an invalid option value.
  if (jsx) compilerOptions.jsx = ts.JsxEmit.ReactJSX;
  const out = ts.transpileModule(source, { fileName: file, reportDiagnostics: true, compilerOptions });
  const errors = (out.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const d = errors[0];
    const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : null;
    const where = pos ? ' (line ' + (pos.line + 1) + ')' : '';
    throw new SyntaxError(ts.flattenDiagnosticMessageText(d.messageText, ' ') + where);
  }
  return out.outputText;
}

async function emit(name, source) {
  const file = path.join(dir, name);
  await writeFile(file, source, 'utf8');
  return pathToFileURL(file).href;
}

/* ------------------------------------------------------------ environments */

async function setupDom() {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const win = dom.window;

  // Several of these exist on modern Node's globalThis as getter-only
  // properties, so a plain assignment throws. Always go through defineProperty.
  const def = (key, value) => {
    try {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    } catch { /* non-configurable host global; jsdom's own copy will be used */ }
  };

  def('window', win);
  def('document', win.document);
  def('self', win);
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key in globalThis || key.startsWith('_')) continue;
    try {
      Object.defineProperty(globalThis, key, { get: () => win[key], configurable: true });
    } catch { /* ignore */ }
  }
  for (const key of ['navigator', 'location', 'history', 'requestAnimationFrame', 'cancelAnimationFrame',
                     'getComputedStyle', 'matchMedia', 'localStorage', 'sessionStorage', 'scrollTo']) {
    if (win[key] === undefined) continue;
    def(key, typeof win[key] === 'function' ? win[key].bind(win) : win[key]);
  }
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    def('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 16));
    def('cancelAnimationFrame', clearTimeout);
  }
  def('IS_REACT_ACT_ENVIRONMENT', true);

  const rtl = await import('@testing-library/react');
  const React = await import('react');
  // `screen` collides with the window property defined above (getter-only), so
  // these also go through def() rather than Object.assign.
  const testingGlobals = {
    React: React.default || React,
    render: rtl.render,
    screen: rtl.screen,
    fireEvent: rtl.fireEvent,
    waitFor: rtl.waitFor,
    act: rtl.act,
    within: rtl.within,
    renderHook: rtl.renderHook,
    cleanup: rtl.cleanup,
  };
  for (const [key, value] of Object.entries(testingGlobals)) def(key, value);
  rootSuite.after.push(() => rtl.cleanup());
}

const normRow = (row) => {
  if (row === null || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'bigint' ? Number(v) : v;
  return out;
};

async function setupPostgres() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create();
  if (fixtures) await db.exec(fixtures);

  let cached = null;
  const execUser = async () => {
    if (!cached) {
      try { cached = { results: await db.exec(code) }; }
      catch (e) { cached = { error: e }; }
    }
    if (cached.error) throw cached.error;
    return cached.results;
  };

  Object.assign(globalThis, {
    db,
    userSql: code,
    execUser,
    /** Rows returned by the last statement in the learner's SQL. */
    queryUser: async () => {
      const rs = await execUser();
      const last = rs[rs.length - 1];
      return ((last && last.rows) || []).map(normRow);
    },
    /** A query the grader runs itself, e.g. to inspect a table afterwards. */
    q: async (sqlText, params) => {
      const r = await db.query(sqlText, params);
      return ((r && r.rows) || []).map(normRow);
    },
  });

  // Run the learner's SQL once up front, outside any transaction, so that a
  // lesson whose answer is DDL leaves its tables in place for every test.
  // A failure is cached and surfaces when a test touches execUser/queryUser.
  await execUser().catch(() => {});

  // Then isolate each test in a transaction it cannot commit, so a test that
  // inserts rows cannot change what the next test sees.
  rootSuite.before.push(async () => { await db.exec('begin'); });
  rootSuite.after.push(async () => {
    try {
      await db.exec('rollback');
    } catch {
      // A statement error already aborted the transaction; the rollback above
      // is what unwinds it, and a second failure here is not interesting.
    }
  });
}

/* ---------------------------------------------------------- typechecking */

const TYPE_HELPERS = [
  'type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;',
  'type Expect<T extends true> = T;',
  'type ExpectFalse<T extends false> = T;',
  'type IsAny<T> = 0 extends 1 & T ? true : false;',
].join('\n');

function typecheckLesson() {
  const solPath = path.join(dir, 'solution.ts');
  const specPath = path.join(dir, 'spec.ts');
  const files = new Map([
    [solPath, code],
    [specPath, TYPE_HELPERS + '\n' + (tests || '')],
  ]);
  const same = (a, b) => path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
  const lookup = (f) => {
    for (const [p, src] of files) if (same(p, f)) return src;
    return undefined;
  };

  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: false,
  };
  const host = ts.createCompilerHost(options, true);
  const origGetSource = host.getSourceFile.bind(host);
  const origFileExists = host.fileExists.bind(host);
  const origReadFile = host.readFile.bind(host);
  host.getSourceFile = (fileName, langVersion, onError, shouldCreate) => {
    const src = lookup(fileName);
    return src !== undefined
      ? ts.createSourceFile(fileName, src, langVersion, true)
      : origGetSource(fileName, langVersion, onError, shouldCreate);
  };
  host.fileExists = (f) => lookup(f) !== undefined || origFileExists(f);
  host.readFile = (f) => {
    const src = lookup(f);
    return src !== undefined ? src : origReadFile(f);
  };

  const program = ts.createProgram([solPath, specPath], options, host);
  const diags = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()]
    .filter((d) => d.category === ts.DiagnosticCategory.Error);

  if (!diags.length) {
    const out = [{ name: 'tsc --strict reports no errors', passed: true }];
    if (tests) out.push({ name: 'type-level assertions hold', passed: true });
    return out;
  }
  return diags.slice(0, 10).map((d) => {
    const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : null;
    const where = d.file ? path.basename(d.file.fileName).replace('.ts', '') : 'unknown';
    return {
      name: 'TS' + d.code + ' in ' + where + (pos ? ':' + (pos.line + 1) : ''),
      passed: false,
      error: ts.flattenDiagnosticMessageText(d.messageText, '\n  '),
    };
  });
}

/* -------------------------------------------------------------- main flow */

function cleanStack(stack) {
  return String(stack).split('\n').slice(1)
    .filter((l) => l.includes('solution') || l.includes('spec'))
    .slice(0, 3)
    .map((l) => '\n  ' + l.trim().replace(/file:\/\/\/\S*?([^/\\]+\.mjs)/, '$1'))
    .join('');
}

async function main() {
  const started = Date.now();
  const done = (extra) => ({ logs, ms: Date.now() - started, tests: [], ...extra });

  if (kind === 'typecheck') {
    const results = typecheckLesson();
    return done({ ok: results.every((r) => r.passed), tests: results });
  }

  const jsx = kind === 'react';

  if (kind === 'sql') {
    try {
      await setupPostgres();
    } catch (e) {
      return done({ ok: false, phase: 'fixture', error: 'Could not prepare the database fixture: ' + e.message });
    }
  } else {
    let url;
    try {
      url = await emit('solution.mjs', compile(code, jsx ? 'solution.tsx' : 'solution.ts', jsx));
    } catch (e) {
      return done({ ok: false, phase: 'compile', error: 'Your code did not compile.\n' + e.message });
    }
    if (jsx) await setupDom();
    try {
      globalThis.solution = await import(url);
    } catch (e) {
      const detail = e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : String(e && e.message || e);
      return done({ ok: false, phase: 'load', error: 'Your code threw while loading.\n' + detail });
    }
  }

  try {
    const specUrl = await emit('spec.mjs', compile(tests || '', jsx ? 'spec.tsx' : 'spec.ts', jsx));
    await import(specUrl);
  } catch (e) {
    return done({ ok: false, phase: 'grader', error: 'The grader failed to load (lesson bug): ' + e.message });
  }

  const results = [];
  for (const t of registered) {
    const at = Date.now();
    // Tell the parent which test is in flight, so a timeout can name it.
    parentPort.postMessage({ progress: t.name });
    const scoped = hooksFor(t);
    try {
      for (const h of scoped.before) await h();
      await t.fn();
      results.push({ name: t.name, passed: true, ms: Date.now() - at });
    } catch (e) {
      results.push({
        name: t.name,
        passed: false,
        ms: Date.now() - at,
        error: e instanceof AssertionError
          ? e.message
          : ((e && e.name) || 'Error') + ': ' + ((e && e.message) || String(e)) + (e && e.stack ? cleanStack(e.stack) : ''),
      });
    } finally {
      for (const h of scoped.after) { try { await h(); } catch { /* ignore */ } }
    }
  }

  if (!results.length) return done({ ok: false, error: 'The grader registered no tests (lesson bug).' });
  return done({ ok: results.every((r) => r.passed), tests: results });
}

main().then(
  (res) => {
    clearInterval(keepAlive);
    parentPort.postMessage(res);
  },
  (e) => {
    clearInterval(keepAlive);
    parentPort.postMessage({
      ok: false, tests: [], logs, error: 'Sandbox crashed: ' + ((e && e.message) || String(e)),
    });
  },
);

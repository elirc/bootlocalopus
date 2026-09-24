/**
 * describe/it/hooks and the run loop, as a factory: every call returns fresh
 * state, so the mutation kind can run the same spec against several
 * implementations without one run's registrations leaking into the next.
 *
 * Hooks are scoped to the describe that declared them, like every real
 * runner: setup outermost-first, teardown innermost-first. `beforeAll` runs
 * before the first test of its suite, `afterAll` after the last.
 *
 * The run loop is part of the trusted core, so it only uses captured
 * primordials (see primordials.mjs).
 */
import * as P from './primordials.mjs';
import { show } from './format.mjs';
import { AssertionError, createExpect } from './expect.mjs';

class TestTimeout extends Error {
  constructor(ms) {
    super('timed out after ' + fmtSeconds(ms));
    this.name = 'TestTimeout';
  }
}

const fmtSeconds = (ms) => (ms % 1000 === 0 ? ms / 1000 : (ms / 1000).toFixed(1)) + ' s';

const isThenable = (v) => v !== null && (typeof v === 'object' || typeof v === 'function') && typeof v.then === 'function';

/** Race a (possibly async) value against a ref'd timer. Sync values are returned as they are. */
function withTimeout(value, ms) {
  if (!isThenable(value)) return value;
  return new P.PromiseCtor((resolve, reject) => {
    const timer = P.SetTimeout(() => reject(new TestTimeout(ms)), ms);
    P.PromisePrototypeThen(P.PromiseResolve(value),
      (v) => { P.ClearTimeout(timer); resolve(v); },
      (e) => { P.ClearTimeout(timer); reject(e); });
  });
}

/** One macrotask turn and one check-phase turn: lets late timers and rejections land on the test that spawned them. */
const settleTick = () => new P.PromiseCtor((resolve) => P.SetTimeout(() => P.SetImmediate(resolve), 0));

function cleanStack(stack) {
  const lines = P.ArrayPrototypeSlice(P.StringPrototypeSplit(String(stack), '\n'), 1);
  const kept = P.ArrayPrototypeFilter(lines, (l) => P.StringPrototypeIncludes(l, 'solution') || P.StringPrototypeIncludes(l, 'spec'));
  return P.ArrayPrototypeJoin(P.ArrayPrototypeMap(P.ArrayPrototypeSlice(kept, 0, 3),
    (l) => '\n  ' + P.StringPrototypeReplace(P.StringPrototypeTrim(l), /file:\/\/\/\S*?([^/\\]+\.mjs)(\?[^:]*)?/, '$1')), '');
}

export function describeError(e) {
  if (AssertionError.is(e)) return String(e.message);
  if (e instanceof TestTimeout) return e.message;
  if (e !== null && typeof e === 'object' && 'message' in e) {
    let s;
    try { s = String(e.name || 'Error') + ': ' + String(e.message) + (e.stack ? cleanStack(e.stack) : ''); }
    catch { s = 'Error (unprintable)'; }
    return s;
  }
  return 'Thrown: ' + show(e);
}

/**
 * @param {{ perTestTimeoutMs?: number, requireAssertions?: boolean, onLog?: (level: string, text: string) => void }} opts
 */
export function createHarness({ perTestTimeoutMs = 5_000, requireAssertions = false, onLog = () => {} } = {}) {
  const newSuite = (name, parent) => ({ name, parent, before: [], after: [], beforeAll: [], afterAll: [] });
  const root = newSuite(null, null);
  const internalBefore = [];
  const internalAfter = [];
  const registered = [];
  let current = root;
  let running = false;
  /** The test whose body, hooks or grace tick is executing now. */
  let active = null;

  const guard = (what) => {
    if (running) throw new Error(what + '() cannot be called while tests are running; register tests at the top level or inside describe()');
  };

  function describe(name, fn) {
    guard('describe');
    if (typeof fn !== 'function') throw new TypeError('describe() needs a callback');
    const suite = newSuite(String(name), current);
    const previous = current;
    current = suite;
    let ret;
    try {
      ret = fn();
    } finally {
      current = previous;
    }
    if (isThenable(ret)) {
      P.PromisePrototypeThen(P.PromiseResolve(ret), undefined, () => {});
      throw new Error('describe callbacks must be synchronous: move the async work into it() or beforeAll()');
    }
  }

  function it(name, fn) {
    guard('it');
    if (typeof fn !== 'function') throw new TypeError('it() needs a test function');
    const chain = [];
    for (let s = current; s; s = s.parent) P.ArrayPrototypePush(chain, s);
    P.ArrayPrototypeReverse(chain);
    const names = [];
    for (const s of chain) if (s.name) P.ArrayPrototypePush(names, s.name);
    P.ArrayPrototypePush(names, String(name));
    P.ArrayPrototypePush(registered, { name: P.ArrayPrototypeJoin(names, ' › '), fn, chain });
  }

  const hook = (key, label) => (fn) => {
    guard(label);
    if (typeof fn !== 'function') throw new TypeError(label + '() needs a function');
    P.ArrayPrototypePush(current[key], fn);
  };

  const expect = createExpect({
    onAssertion: () => { if (active) active.assertions++; },
    track: (p) => {
      // Watch the promise without creating an unhandled rejection of our own.
      const settled = P.PromisePrototypeThen(p, () => null, (e) => ({ error: e }));
      if (active) P.ArrayPrototypePush(active.pending, settled);
    },
  });

  const api = {
    describe,
    it,
    test: it,
    beforeEach: hook('before', 'beforeEach'),
    afterEach: hook('after', 'afterEach'),
    beforeAll: hook('beforeAll', 'beforeAll'),
    afterAll: hook('afterAll', 'afterAll'),
  };

  /**
   * Environment hooks that wrap every test. An internal `beforeEach` that
   * throws fails the test; an internal `afterEach` fails it only by returning
   * a message string, and otherwise its errors are logged, not raised.
   */
  function addRootHook(kind, fn, { internal = true } = {}) {
    if (!internal) {
      P.ArrayPrototypePush(kind === 'beforeEach' ? root.before : root.after, fn);
      return;
    }
    P.ArrayPrototypePush(kind === 'beforeEach' ? internalBefore : internalAfter, fn);
  }

  /** Attribute an uncaught error or unhandled rejection to the running test. False if none is running. */
  function reportUncaught(err) {
    if (!active) return false;
    P.ArrayPrototypePush(active.late, err);
    return true;
  }

  async function run({ onPlan = () => {}, onTest = () => {} } = {}) {
    running = true;
    const tests = P.ArrayPrototypeSlice(registered, 0);
    onPlan(P.ArrayPrototypeMap(tests, (t) => t.name));

    // First and last test index per suite, for beforeAll/afterAll.
    const first = new P.MapCtor(), last = new P.MapCtor();
    for (let i = 0; i < tests.length; i++) {
      for (const s of tests[i].chain) {
        if (!P.MapPrototypeHas(first, s)) P.MapPrototypeSet(first, s, i);
        P.MapPrototypeSet(last, s, i);
      }
    }
    const allFailed = new P.MapCtor(); // suite -> beforeAll error

    const results = [];
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      const at = P.DateNow();
      const state = { assertions: 0, pending: [], late: [] };
      active = state;
      let error = null;
      // `throw null` / `throw undefined` must still fail: null is the "no error" sentinel.
      const fail = (e) => { if (error === null) error = e == null ? new Error('threw ' + String(e)) : e; };

      for (const s of t.chain) {
        if (P.MapPrototypeGet(first, s) !== i) continue;
        for (const h of s.beforeAll) {
          try { await withTimeout(h(), perTestTimeoutMs); }
          catch (e) { P.MapPrototypeSet(allFailed, s, e); break; }
        }
      }
      for (const s of t.chain) {
        if (P.MapPrototypeHas(allFailed, s)) { fail(new Error('beforeAll failed: ' + describeError(P.MapPrototypeGet(allFailed, s)))); break; }
      }

      if (error === null) {
        try {
          for (const h of internalBefore) await withTimeout(h(), perTestTimeoutMs);
          for (const s of t.chain) for (const h of s.before) await withTimeout(h(), perTestTimeoutMs);
          await withTimeout(t.fn(), perTestTimeoutMs);
          for (const p of state.pending) {
            const r = await withTimeout(p, perTestTimeoutMs);
            if (r && error === null) fail(r.error);
          }
        } catch (e) {
          fail(e);
        }
      }
      await settleTick();
      // Async matchers started late (e.g. inside a timer) still count.
      for (const p of P.ArrayPrototypeSlice(state.pending, 0)) {
        try {
          const r = await withTimeout(p, perTestTimeoutMs);
          if (r) fail(r.error);
        } catch (e) { fail(e); }
      }

      // Author afterEach hooks, innermost suite first: a failure fails the test.
      for (let k = t.chain.length - 1; k >= 0; k--) {
        for (const h of t.chain[k].after) {
          try { await withTimeout(h(), perTestTimeoutMs); }
          catch (e) { fail(new Error('afterEach failed: ' + describeError(e))); }
        }
      }
      if (state.late.length) fail(state.late[0]);
      if (error === null && requireAssertions && state.assertions === 0) {
        fail(new AssertionError('this test asserts nothing: call expect() at least once'));
      }
      // Environment teardown last. A returned string fails the test.
      for (const h of internalAfter) {
        try {
          const verdict = await withTimeout(h(), perTestTimeoutMs);
          if (typeof verdict === 'string') fail(new AssertionError(verdict));
        } catch (e) {
          onLog('error', 'grader cleanup failed: ' + describeError(e));
        }
      }
      for (let k = t.chain.length - 1; k >= 0; k--) {
        const s = t.chain[k];
        if (P.MapPrototypeGet(last, s) !== i) continue;
        for (const h of s.afterAll) {
          try { await withTimeout(h(), perTestTimeoutMs); }
          catch (e) { fail(new Error('afterAll failed: ' + describeError(e))); }
        }
      }
      active = null;

      const result = error === null
        ? { name: t.name, passed: true, ms: P.DateNow() - at }
        : { name: t.name, passed: false, ms: P.DateNow() - at, error: describeError(error) };
      P.ArrayPrototypePush(results, result);
      onTest(result);
    }
    return results;
  }

  return { api, expect, run, addRootHook, reportUncaught, registeredCount: () => registered.length };
}

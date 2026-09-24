/**
 * `expect()` and its matchers.
 *
 * - Messages are built lazily, only when an assertion fails, so a learner's
 *   getters run exactly as often as the test itself reads them.
 * - Matcher objects are frozen and inherit from a frozen prototype, so
 *   `expect(x).toBe = () => {}` throws instead of neutering the next check.
 * - `.rejects`/`.resolves` return promises that are also handed to `track()`,
 *   so the harness awaits them even when the test forgot to.
 */
import * as P from './primordials.mjs';
import { show } from './format.mjs';
import { looseEqual, strictEqual, subsetEqual } from './equality.mjs';

export class AssertionError extends Error {
  #brand = true;
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
  /** Brand check that a learner cannot forge with Symbol.hasInstance or a fake prototype. */
  static is(e) {
    return e !== null && typeof e === 'object' && #brand in e;
  }
}

export const bail = (msg) => { throw new AssertionError(msg); };

const S_ACTUAL = Symbol('actual');
const S_NEG = Symbol('negated');
const S_CTX = Symbol('context');

const isThenable = (v) => v !== null && (typeof v === 'object' || typeof v === 'function') && typeof v.then === 'function';

const isPlainObject = (v) => {
  if (v === null || typeof v !== 'object') return false;
  const proto = P.ObjectGetPrototypeOf(v);
  return proto === P.ObjectPrototype || proto === null;
};

function errorMessage(err) {
  try {
    return err instanceof Error || (err && typeof err === 'object' && 'message' in err) ? String(err.message) : String(err);
  } catch {
    return '[unprintable error]';
  }
}

/** Validate a toThrow() argument; throws a helpful AssertionError for anything else. */
function checkThrowExpectation(expected) {
  if (expected === undefined || typeof expected === 'string' || expected instanceof RegExp ||
      typeof expected === 'function' || expected instanceof Error || isPlainObject(expected)) return;
  bail('toThrow() takes a string, RegExp, Error class, Error or object, got ' + show(expected));
}

/** Does `err` match what toThrow(expected) asked for? Returns a description of the mismatch, or null. */
function throwMismatch(err, expected) {
  if (expected === undefined) return null;
  const msg = errorMessage(err);
  if (typeof expected === 'string') {
    return P.StringPrototypeIncludes(msg, expected) ? null
      : 'expected the error message to include ' + show(expected) + ', got ' + show(msg);
  }
  if (expected instanceof RegExp) {
    return P.RegExpPrototypeTest(expected, msg) ? null
      : 'expected the error message to match ' + String(expected) + ', got ' + show(msg);
  }
  if (typeof expected === 'function') {
    return err instanceof expected ? null
      : 'expected the error to be an instance of ' + (expected.name || 'the given class') + ', got ' + show(err);
  }
  if (expected instanceof Error) {
    return msg === String(expected.message) ? null
      : 'expected the error message to be ' + show(String(expected.message)) + ', got ' + show(msg);
  }
  const out = {};
  return subsetEqual(err, expected, out) ? null
    : 'expected the error to match ' + show(expected) + ', got ' + show(err) + (out.reason ? ' (' + out.reason + ')' : '');
}

const MATCHER_NAMES = [];

/**
 * Build an `expect` bound to a harness. `onAssertion()` is called once per
 * matcher invocation (the mutation kind requires every test to assert
 * something); `track(promise)` hands async matchers to the running test.
 */
export function createExpect({ onAssertion = () => {}, track = () => {} } = {}) {
  const ctx = { onAssertion, track };

  function check(self, pass, msg, negMsg) {
    self[S_CTX].onAssertion();
    const negated = self[S_NEG];
    if (negated ? pass : !pass) bail(negated ? negMsg() : msg());
  }

  const proto = {
    toBe(exp) {
      const a = this[S_ACTUAL];
      check(this, P.ObjectIs(a, exp),
        () => {
          const sa = show(a), se = show(exp);
          return 'expected ' + sa + ' to be ' + se +
            (sa === se && typeof a === 'object' && a !== null
              ? '\n  (they look the same but are different objects: toBe compares identity; use toEqual to compare contents)'
              : '');
        },
        () => 'expected ' + show(a) + ' NOT to be ' + show(exp));
    },
    toEqual(exp) {
      const a = this[S_ACTUAL];
      const out = {};
      check(this, looseEqual(a, exp, out),
        () => 'expected ' + show(a) + '\n  to deeply equal ' + show(exp) + (out.reason ? '\n  (' + out.reason + ')' : ''),
        () => 'expected ' + show(a) + ' NOT to deeply equal ' + show(exp));
    },
    toStrictEqual(exp) {
      const a = this[S_ACTUAL];
      const out = {};
      check(this, strictEqual(a, exp, out),
        () => 'expected ' + show(a) + '\n  to strictly equal ' + show(exp) +
          (out.reason ? '\n  (' + out.reason + ')' : '\n  (toStrictEqual also compares prototypes, undefined properties, -0 and array holes)'),
        () => 'expected ' + show(a) + ' NOT to strictly equal ' + show(exp));
    },
    toMatchObject(exp) {
      const a = this[S_ACTUAL];
      const out = {};
      check(this, subsetEqual(a, exp, out),
        () => 'expected ' + show(a) + '\n  to match ' + show(exp) + (out.reason ? '\n  (' + out.reason + ')' : ''),
        () => 'expected ' + show(a) + ' NOT to match ' + show(exp));
    },
    toBeTruthy() { const a = this[S_ACTUAL]; check(this, !!a, () => 'expected ' + show(a) + ' to be truthy', () => 'expected ' + show(a) + ' to be falsy'); },
    toBeFalsy() { const a = this[S_ACTUAL]; check(this, !a, () => 'expected ' + show(a) + ' to be falsy', () => 'expected ' + show(a) + ' to be truthy'); },
    toBeNull() { const a = this[S_ACTUAL]; check(this, a === null, () => 'expected ' + show(a) + ' to be null', () => 'expected ' + show(a) + ' not to be null'); },
    toBeUndefined() { const a = this[S_ACTUAL]; check(this, a === undefined, () => 'expected ' + show(a) + ' to be undefined', () => 'expected ' + show(a) + ' to be defined'); },
    toBeDefined() { const a = this[S_ACTUAL]; check(this, a !== undefined, () => 'expected value to be defined', () => 'expected ' + show(a) + ' to be undefined'); },
    toBeNaN() { const a = this[S_ACTUAL]; check(this, P.NumberIsNaN(a), () => 'expected ' + show(a) + ' to be NaN', () => 'expected ' + show(a) + ' not to be NaN'); },
    toBeTypeOf(t) {
      const a = this[S_ACTUAL];
      check(this, typeof a === t,
        () => 'expected typeof value to be "' + t + '", got "' + typeof a + '"',
        () => 'expected typeof value not to be "' + t + '"');
    },
    toBeInstanceOf(C) {
      const a = this[S_ACTUAL];
      let pass = false;
      try { pass = a instanceof C; } catch { pass = false; }
      check(this, pass,
        () => 'expected ' + show(a) + ' to be an instance of ' + ((C && C.name) || show(C)),
        () => 'expected ' + show(a) + ' not to be an instance of ' + ((C && C.name) || show(C)));
    },
    toContain(item) {
      const a = this[S_ACTUAL];
      let pass = false;
      if (typeof a === 'string') pass = P.StringPrototypeIncludes(a, item);
      else if (P.ArrayIsArray(a)) pass = P.ArrayPrototypeIncludes(a, item);
      else if (a !== null && typeof a === 'object' && typeof a[Symbol.iterator] === 'function') pass = P.ArrayPrototypeIncludes([...a], item);
      check(this, pass, () => 'expected ' + show(a) + ' to contain ' + show(item), () => 'expected ' + show(a) + ' not to contain ' + show(item));
    },
    toContainEqual(item) {
      const a = this[S_ACTUAL];
      let pass = false;
      if (a !== null && typeof a === 'object' && typeof a[Symbol.iterator] === 'function') {
        pass = P.ArrayPrototypeSome(P.ArrayIsArray(a) ? a : [...a], (v) => looseEqual(v, item));
      }
      check(this, pass,
        () => 'expected ' + show(a) + ' to contain an item equal to ' + show(item),
        () => 'expected ' + show(a) + ' not to contain an item equal to ' + show(item));
    },
    toHaveLength(n) {
      const a = this[S_ACTUAL];
      const len = a == null ? undefined : a.length;
      check(this, len === n,
        () => 'expected length ' + n + ', got ' + (a == null ? show(a) + ' (no length)' : show(len)),
        () => 'expected length not to be ' + n);
    },
    toHaveProperty(key, ...rest) {
      const a = this[S_ACTUAL];
      const parts = P.ArrayIsArray(key) ? key : P.StringPrototypeSplit(String(key), '.');
      let cur = a, found = true;
      for (const p of parts) {
        if (cur == null || !(p in Object(cur))) { found = false; break; }
        cur = cur[p];
      }
      const pass = found && (rest.length === 0 || looseEqual(cur, rest[0]));
      check(this, pass,
        () => 'expected ' + show(a) + ' to have property "' + key + '"' +
          (rest.length ? ' equal to ' + show(rest[0]) + (found ? ' (got ' + show(cur) + ')' : ' (it has no such property)') : ''),
        () => 'expected ' + show(a) + ' not to have property "' + key + '"' + (rest.length ? ' equal to ' + show(rest[0]) : ''));
    },
    toBeGreaterThan(n) { const a = this[S_ACTUAL]; check(this, a > n, () => 'expected ' + show(a) + ' > ' + show(n), () => 'expected ' + show(a) + ' not > ' + show(n)); },
    toBeGreaterThanOrEqual(n) { const a = this[S_ACTUAL]; check(this, a >= n, () => 'expected ' + show(a) + ' >= ' + show(n), () => 'expected ' + show(a) + ' not >= ' + show(n)); },
    toBeLessThan(n) { const a = this[S_ACTUAL]; check(this, a < n, () => 'expected ' + show(a) + ' < ' + show(n), () => 'expected ' + show(a) + ' not < ' + show(n)); },
    toBeLessThanOrEqual(n) { const a = this[S_ACTUAL]; check(this, a <= n, () => 'expected ' + show(a) + ' <= ' + show(n), () => 'expected ' + show(a) + ' not <= ' + show(n)); },
    toBeCloseTo(n, digits = 2) {
      const a = this[S_ACTUAL];
      const pass = typeof a === 'number' && P.MathAbs(a - n) < P.MathPow(10, -digits) / 2;
      check(this, pass, () => 'expected ' + show(a) + ' to be close to ' + show(n) + ' (' + digits + ' digits)',
        () => 'expected ' + show(a) + ' not to be close to ' + show(n));
    },
    toMatch(re) {
      const a = this[S_ACTUAL];
      if (typeof a !== 'string') bail('toMatch() needs a string, got ' + show(a));
      const pass = typeof re === 'string' ? P.StringPrototypeIncludes(a, re) : re instanceof RegExp && P.RegExpPrototypeTest(re, a);
      check(this, pass, () => 'expected ' + show(a) + ' to match ' + (typeof re === 'string' ? show(re) : String(re)),
        () => 'expected ' + show(a) + ' not to match ' + (typeof re === 'string' ? show(re) : String(re)));
    },
    toThrow(expected) {
      const a = this[S_ACTUAL];
      this[S_CTX].onAssertion();
      checkThrowExpectation(expected);
      if (typeof a !== 'function') bail('expect(...).toThrow() needs a function to call, got ' + show(a));
      let threw = false, err, ret;
      try { ret = a(); } catch (e) { threw = true; err = e; }
      if (!threw && isThenable(ret)) {
        P.PromisePrototypeThen(P.PromiseResolve(ret), undefined, () => {});
        bail('this function is async: use `await expect(fn()).rejects.toThrow(…)`');
      }
      judgeThrow(this[S_NEG], threw, err, expected, 'the function');
    },
    toThrowError(expected) { return this.toThrow(expected); },
    get not() {
      return this[S_NEG] ? undefined : makeMatchers(ctx, this[S_ACTUAL], true);
    },
    get rejects() { return makeAsync(ctx, this[S_ACTUAL], 'rejects', false); },
    get resolves() { return makeAsync(ctx, this[S_ACTUAL], 'resolves', false); },
  };
  P.ObjectFreeze(proto);

  function makeMatchers(c, actual, negated) {
    const m = P.ObjectCreate(proto);
    P.ObjectDefineProperty(m, S_ACTUAL, { value: actual });
    P.ObjectDefineProperty(m, S_NEG, { value: negated });
    P.ObjectDefineProperty(m, S_CTX, { value: c });
    return P.ObjectFreeze(m);
  }

  function makeAsync(c, actual, mode, negated) {
    const target = {};
    for (const name of matcherNames(proto)) {
      target[name] = (...args) => {
        const p = (async () => {
          let value, err, rejected = false;
          try {
            value = await (typeof actual === 'function' ? actual() : actual);
          } catch (e) {
            rejected = true;
            err = e;
          }
          if (mode === 'rejects') {
            if (!rejected) {
              c.onAssertion();
              bail('expected the promise to reject, but it resolved with ' + show(value));
            }
            if (name === 'toThrow' || name === 'toThrowError') {
              c.onAssertion();
              checkThrowExpectation(args[0]);
              judgeThrow(negated, true, err, args[0], 'the promise');
              return;
            }
            return makeMatchers(c, err, negated)[name](...args);
          }
          if (rejected) {
            c.onAssertion();
            bail('expected the promise to resolve, but it rejected with ' + show(err));
          }
          return makeMatchers(c, value, negated)[name](...args);
        })();
        c.track(p);
        return p;
      };
    }
    if (!negated) target.not = makeAsync(c, actual, mode, true);
    return P.ObjectFreeze(target);
  }

  function expect(actual) {
    return makeMatchers(ctx, actual, false);
  }
  return P.ObjectFreeze(expect);
}

function judgeThrow(negated, threw, err, expected, what) {
  if (negated) {
    if (!threw) return;
    if (expected === undefined) bail('expected ' + what + ' not to throw, but it threw ' + show(err));
    if (throwMismatch(err, expected) === null) bail('expected ' + what + ' not to throw a matching error, but it threw ' + show(err));
    return;
  }
  if (!threw) bail(what === 'the function' ? 'expected the function to throw, but it returned normally' : 'expected ' + what + ' to reject');
  const mismatch = throwMismatch(err, expected);
  if (mismatch) bail(mismatch);
}

function matcherNames(proto) {
  if (!MATCHER_NAMES.length) {
    for (const k of Object.getOwnPropertyNames(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, k);
      if (d && typeof d.value === 'function') MATCHER_NAMES.push(k);
    }
  }
  return MATCHER_NAMES;
}

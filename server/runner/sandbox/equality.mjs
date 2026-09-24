/**
 * Structural equality for `toEqual`, `toStrictEqual` and `toMatchObject`.
 *
 * `looseEqual` is what a lesson author means by "the same data": it ignores
 * keys whose value is `undefined`, treats 0 and -0 as equal, lets an integer
 * number equal the same bigint (Postgres), and never coerces strings. It is
 * NOT "whatever Object.keys says": a Map is not `{}`, two regexes with
 * different sources differ, two URLs compare by href, iterables compare by
 * their entries, and two objects that expose no enumerable data at all
 * (Blob, Response, anything with only #private state) are refused rather than
 * silently equal.
 *
 * `strictEqual` applies the same type guards, then `util.isDeepStrictEqual`.
 *
 * Every function takes an optional `out` object; when a comparison fails for
 * a reason the caller should explain, `out.reason` is set.
 */
import { isDeepStrictEqual } from 'node:util';
import * as P from './primordials.mjs';

const ITERATION_CAP = 10_000;

const isObj = (v) => v !== null && (typeof v === 'object' || typeof v === 'function');
const tagOf = (v) => P.ObjectPrototypeToString(v);

const BOXED = new Set(['[object Number]', '[object String]', '[object Boolean]', '[object Symbol]', '[object BigInt]']);
const VALUE_OF = {
  '[object Number]': P.uncurry(Number.prototype.valueOf),
  '[object String]': P.uncurry(String.prototype.valueOf),
  '[object Boolean]': P.uncurry(Boolean.prototype.valueOf),
  '[object Symbol]': P.uncurry(Symbol.prototype.valueOf),
  '[object BigInt]': P.uncurry(BigInt.prototype.valueOf),
};

function ctorName(v) {
  try {
    const proto = P.ObjectGetPrototypeOf(v);
    const name = proto && proto.constructor && proto.constructor.name;
    return typeof name === 'string' && name ? name : 'object';
  } catch {
    return 'object';
  }
}

/** Own enumerable string and symbol keys; in loose mode, only those whose value is not undefined. */
function dataKeys(o, strict) {
  const out = [];
  const ks = P.ObjectKeys(o);
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    if (strict || o[k] !== undefined) P.ArrayPrototypePush(out, k);
  }
  const ss = P.ObjectGetOwnPropertySymbols(o);
  for (let i = 0; i < ss.length; i++) {
    const s = ss[i];
    if (P.ObjectPrototypePropertyIsEnumerable(o, s) && (strict || o[s] !== undefined)) P.ArrayPrototypePush(out, s);
  }
  return out;
}

function hasDataKey(o, k, strict) {
  return P.ObjectPrototypeHasOwnProperty(o, k) && P.ObjectPrototypePropertyIsEnumerable(o, k) && (strict || o[k] !== undefined);
}

function collect(iterable) {
  const out = [];
  for (const v of iterable) {
    if (out.length >= ITERATION_CAP) return null;
    P.ArrayPrototypePush(out, v);
  }
  return out;
}

function bytesOf(v) {
  if (P.ArrayBufferIsView(v)) return new P.Uint8ArrayCtor(v.buffer, v.byteOffset, v.byteLength);
  return new P.Uint8ArrayCtor(v);
}

function sameBytes(a, b) {
  const x = bytesOf(a), y = bytesOf(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

function arraysEqual(a, b, cx) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (cx.strict && (i in a) !== (i in b)) return false;
    if (!eq(a[i], b[i], cx)) return false;
  }
  return true;
}

function keysEqual(a, b, cx) {
  const ka = dataKeys(a, cx.strict);
  const kb = dataKeys(b, cx.strict);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    const k = ka[i];
    if (!hasDataKey(b, k, cx.strict)) return false;
    if (!eq(a[k], b[k], cx)) return false;
  }
  return true;
}

function eq(a, b, cx) {
  // 1. Identity. Loose: === (so 0 equals -0) plus NaN. Strict: Object.is.
  if (cx.strict) {
    if (P.ObjectIs(a, b)) return true;
  } else {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return a !== a && b !== b;
  }
  // 2. Integer number vs bigint (loose only). Never through strings.
  const ta = typeof a, tb = typeof b;
  if (!cx.strict && ((ta === 'bigint' && tb === 'number') || (ta === 'number' && tb === 'bigint'))) {
    const n = ta === 'number' ? a : b;
    const big = ta === 'bigint' ? a : b;
    return P.NumberIsInteger(n) && P.BigIntCtor(n) === big;
  }
  // 3. Primitives that were not identical are different.
  if (!isObj(a) || !isObj(b)) return false;
  // 4. Different kinds of object are different: Map is not {}, [] is not {}.
  const tag = tagOf(a);
  if (tag !== tagOf(b)) return false;
  // 5. Cycles.
  if (P.MapPrototypeGet(cx.seen, a) === b) return true;
  P.MapPrototypeSet(cx.seen, a, b);

  // 6. Types with internal state.
  if (tag === '[object Date]') return P.ObjectIs(P.DatePrototypeGetTime(a), P.DatePrototypeGetTime(b));
  if (tag === '[object RegExp]') return a.source === b.source && a.flags === b.flags;
  if (tag === '[object Error]') {
    if (!eq(a.name, b.name, cx) || !eq(a.message, b.message, cx)) return false;
    const ca = P.ObjectPrototypeHasOwnProperty(a, 'cause'), cb = P.ObjectPrototypeHasOwnProperty(b, 'cause');
    if (ca || cb) {
      if (ca !== cb && cx.strict) return false;
      if (!eq(a.cause, b.cause, cx)) return false;
    }
    return keysEqual(a, b, cx);
  }
  if (BOXED.has(tag)) {
    const va = VALUE_OF[tag](a), vb = VALUE_OF[tag](b);
    return cx.strict ? P.ObjectIs(va, vb) : va === vb || (va !== va && vb !== vb);
  }
  if (tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]' || P.ArrayBufferIsView(a)) {
    return P.ArrayBufferIsView(a) === P.ArrayBufferIsView(b) && sameBytes(a, b);
  }
  if (tag === '[object URL]') return String(a.href) === String(b.href);
  if (tag === '[object Map]') {
    if (P.MapPrototypeGetSize(a) !== P.MapPrototypeGetSize(b)) return false;
    for (const [k, v] of P.MapPrototypeEntries(a)) {
      if (!P.MapPrototypeHas(b, k) || !eq(v, P.MapPrototypeGet(b, k), cx)) return false;
    }
    return true;
  }
  if (tag === '[object Set]') {
    if (P.SetPrototypeGetSize(a) !== P.SetPrototypeGetSize(b)) return false;
    const pool = collect(P.SetPrototypeValues(b));
    if (!pool) {
      cx.reason = `cannot compare sets with more than ${ITERATION_CAP.toLocaleString()} entries`;
      return false;
    }
    const used = [];
    for (const x of P.SetPrototypeValues(a)) {
      let found = false;
      for (let j = 0; j < pool.length && !found; j++) {
        if (used[j]) continue;
        // A trial comparison must not leave cycle-guard entries behind.
        const trial = { seen: new P.MapCtor(cx.seen), strict: cx.strict, reason: null };
        if (eq(x, pool[j], trial)) { used[j] = true; found = true; }
      }
      if (!found) return false;
    }
    return true;
  }
  if (P.ArrayIsArray(a)) return P.ArrayIsArray(b) && arraysEqual(a, b, cx);

  // 7. Other iterables compare by their entries: Headers, URLSearchParams, FormData, NodeList...
  if (typeof a[P.SymbolIterator] === 'function' && typeof b[P.SymbolIterator] === 'function') {
    const xa = collect(a), xb = collect(b);
    if (!xa || !xb) {
      cx.reason = `cannot compare iterables with more than ${ITERATION_CAP.toLocaleString()} entries`;
      return false;
    }
    return arraysEqual(xa, xb, cx);
  }

  // 8. Everything else: the same data keys with equal values. Prototypes are not compared.
  const ka = dataKeys(a, cx.strict);
  if (ka.length === 0 && dataKeys(b, cx.strict).length === 0) {
    const proto = P.ObjectGetPrototypeOf(a);
    if (proto !== P.ObjectPrototype && proto !== null) {
      const name = ctorName(a);
      cx.reason = `cannot structurally compare two ${name} instances that expose no enumerable data; ` +
        'compare a projection (e.g. `[...x]`, `x.href`, `x.toJSON()`)';
      return false;
    }
    return true;
  }
  return keysEqual(a, b, cx);
}

const context = (strict) => ({ seen: new P.MapCtor(), strict, reason: null });

export function looseEqual(a, b, out) {
  const cx = context(false);
  const r = eq(a, b, cx);
  if (out) out.reason = r ? null : cx.reason;
  return r;
}

export function strictEqual(a, b, out) {
  const cx = context(true);
  const r = eq(a, b, cx);
  if (out) out.reason = r ? null : cx.reason;
  if (!r) return false;
  try {
    return isDeepStrictEqual(a, b);
  } catch {
    return false;
  }
}

const isPlain = (v) => {
  if (!isObj(v) || typeof v === 'function') return false;
  const proto = P.ObjectGetPrototypeOf(v);
  return proto === P.ObjectPrototype || proto === null;
};

function sub(obj, subset, cx) {
  if (P.ArrayIsArray(subset)) {
    if (!P.ArrayIsArray(obj) || obj.length !== subset.length) return false;
    for (let i = 0; i < subset.length; i++) if (!sub(obj[i], subset[i], cx)) return false;
    return true;
  }
  if (!isPlain(subset)) return eq(obj, subset, cx);
  if (!isObj(obj)) return false;
  const keys = dataKeys(subset, true);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (subset[k] === undefined) {
      if (obj[k] !== undefined) return false;
      continue;
    }
    if (!(k in obj)) return false;
    if (!sub(obj[k], subset[k], cx)) return false;
  }
  return true;
}

/** Every key in `subset` matches in `obj`, recursively; extra keys in `obj` are ignored. */
export function subsetEqual(obj, subset, out) {
  const cx = context(false);
  const r = sub(obj, subset, cx);
  if (out) out.reason = r ? null : cx.reason;
  return r;
}

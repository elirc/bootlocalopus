/**
 * Builtins the harness's trusted core relies on, captured when this module is
 * evaluated (before any learner code runs). A learner who later patches
 * `Array.prototype.every` or `Object.keys` changes what their own code sees,
 * not what the run loop, `check()` or the equality walk conclude.
 *
 * This narrows the forgery surface; it is not a boundary. The parent process
 * is the boundary: it derives the verdict from the individual rows it receives.
 */
const bind = Function.prototype.bind;
const call = Function.prototype.call;
/** `uncurry(Array.prototype.push)(arr, x)` === `arr.push(x)` with the original method. */
export const uncurry = (fn) => bind.call(call, fn);

export const ObjectIs = Object.is;
export const ObjectKeys = Object.keys;
export const ObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols;
export const ObjectGetPrototypeOf = Object.getPrototypeOf;
export const ObjectDefineProperty = Object.defineProperty;
export const ObjectFreeze = Object.freeze;
export const ObjectCreate = Object.create;
export const ObjectEntries = Object.entries;
export const ObjectPrototype = Object.prototype;
export const ObjectPrototypeToString = uncurry(Object.prototype.toString);
export const ObjectPrototypeHasOwnProperty = uncurry(Object.prototype.hasOwnProperty);
export const ObjectPrototypePropertyIsEnumerable = uncurry(Object.prototype.propertyIsEnumerable);

export const ArrayIsArray = Array.isArray;
export const ArrayPrototypePush = uncurry(Array.prototype.push);
export const ArrayPrototypeEvery = uncurry(Array.prototype.every);
export const ArrayPrototypeSome = uncurry(Array.prototype.some);
export const ArrayPrototypeMap = uncurry(Array.prototype.map);
export const ArrayPrototypeFilter = uncurry(Array.prototype.filter);
export const ArrayPrototypeJoin = uncurry(Array.prototype.join);
export const ArrayPrototypeFlatMap = uncurry(Array.prototype.flatMap);
export const ArrayPrototypeReverse = uncurry(Array.prototype.reverse);
export const ArrayPrototypeSlice = uncurry(Array.prototype.slice);
export const ArrayPrototypeIncludes = uncurry(Array.prototype.includes);

export const StringCtor = String;
export const StringPrototypeIncludes = uncurry(String.prototype.includes);
export const StringPrototypeSplit = uncurry(String.prototype.split);
export const StringPrototypeSlice = uncurry(String.prototype.slice);
export const StringPrototypeStartsWith = uncurry(String.prototype.startsWith);
export const StringPrototypeToLowerCase = uncurry(String.prototype.toLowerCase);
export const StringPrototypeReplace = uncurry(String.prototype.replace);
export const StringPrototypeTrim = uncurry(String.prototype.trim);

export const NumberIsInteger = Number.isInteger;
export const NumberIsFinite = Number.isFinite;
export const NumberIsNaN = Number.isNaN;
export const BigIntCtor = BigInt;
export const MathAbs = Math.abs;
export const MathPow = Math.pow;

export const DateNow = Date.now;
export const DatePrototypeGetTime = uncurry(Date.prototype.getTime);
export const JSONStringify = JSON.stringify;

export const MapCtor = Map;
export const MapPrototypeGet = uncurry(Map.prototype.get);
export const MapPrototypeSet = uncurry(Map.prototype.set);
export const MapPrototypeHas = uncurry(Map.prototype.has);
export const MapPrototypeGetSize = uncurry(Object.getOwnPropertyDescriptor(Map.prototype, 'size').get);
export const MapPrototypeEntries = uncurry(Map.prototype.entries);
export const SetPrototypeGetSize = uncurry(Object.getOwnPropertyDescriptor(Set.prototype, 'size').get);
export const SetPrototypeValues = uncurry(Set.prototype.values);
export const SetPrototypeHas = uncurry(Set.prototype.has);

export const ArrayBufferIsView = ArrayBuffer.isView;
export const Uint8ArrayCtor = Uint8Array;
export const SymbolIterator = Symbol.iterator;

export const PromiseCtor = Promise;
export const PromiseResolve = Promise.resolve.bind(Promise);
export const PromisePrototypeThen = uncurry(Promise.prototype.then);

export const SetTimeout = setTimeout;
export const ClearTimeout = clearTimeout;
export const SetImmediate = setImmediate;
export const ReflectApply = Reflect.apply;
export const ReflectConstruct = Reflect.construct;
export const FunctionPrototypeToString = uncurry(Function.prototype.toString);
export const RegExpPrototypeTest = uncurry(RegExp.prototype.test);
export const ErrorCtor = Error;

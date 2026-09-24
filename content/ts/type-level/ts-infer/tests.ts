import type {
  MyReturnType, MyParameters, FirstParam, ElementOf, MyAwaited, Last,
} from './solution';

declare function load(id: number, deep: boolean): Promise<{ id: number }>;
type Loader = typeof load;

type _ret = Expect<Equal<MyReturnType<Loader>, Promise<{ id: number }>>>;
type _retVoid = Expect<Equal<MyReturnType<() => void>, void>>;
type _retBad = Expect<Equal<MyReturnType<string>, never>>;

type _params = Expect<Equal<MyParameters<Loader>, [id: number, deep: boolean]>>;
type _paramsNone = Expect<Equal<MyParameters<() => void>, []>>;
type _paramsBad = Expect<Equal<MyParameters<number>, never>>;

type _first = Expect<Equal<FirstParam<Loader>, number>>;
type _firstNone = Expect<Equal<FirstParam<() => void>, never>>;

type _el = Expect<Equal<ElementOf<string[]>, string>>;
type _elReadonly = Expect<Equal<ElementOf<readonly number[]>, number>>;
type _elUnion = Expect<Equal<ElementOf<(string | number)[]>, string | number>>;
type _elBad = Expect<Equal<ElementOf<string>, never>>;

type _await = Expect<Equal<MyAwaited<Promise<string>>, string>>;
type _awaitDeep = Expect<Equal<MyAwaited<Promise<Promise<number>>>, number>>;
type _awaitPlain = Expect<Equal<MyAwaited<boolean>, boolean>>;
type _awaitLoader = Expect<Equal<MyAwaited<MyReturnType<Loader>>, { id: number }>>;

type _last = Expect<Equal<Last<[1, 2, 3]>, 3>>;
type _lastOne = Expect<Equal<Last<['only']>, 'only'>>;
type _lastEmpty = Expect<Equal<Last<[]>, never>>;
type _lastMixed = Expect<Equal<Last<[string, number, boolean]>, boolean>>;

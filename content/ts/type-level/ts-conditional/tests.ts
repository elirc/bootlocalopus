import type {
  FunctionKeys, DataKeys, Methods, NonNullableProps, Flatten, Unionise,
} from './solution';

interface Store {
  count: number;
  label: string;
  increment: () => void;
  reset(to: number): void;
}

type _fnKeys = Expect<Equal<FunctionKeys<Store>, 'increment' | 'reset'>>;
type _dataKeys = Expect<Equal<DataKeys<Store>, 'count' | 'label'>>;
type _methods = Expect<Equal<keyof Methods<Store>, 'increment' | 'reset'>>;
type _methodShape = Expect<Equal<Methods<Store>['increment'], () => void>>;

type Loose = { a: string | null; b?: number; c: boolean | undefined };
type _nonNull = Expect<Equal<NonNullableProps<Loose>, { a: string; b: number; c: boolean }>>;

type _flat = Expect<Equal<Flatten<string[][]>, string[]>>;
type _flatOnce = Expect<Equal<Flatten<number[]>, number[]>>;
type _flatNoop = Expect<Equal<Flatten<string>, string>>;
type _flatReadonly = Expect<Equal<Flatten<readonly boolean[]>, readonly boolean[]>>;
type _flatDeep = Expect<Equal<Flatten<number[][][]>, number[][]>>;

type Pair = Unionise<{ a: number; b: string }>;
type _union = Expect<Equal<Pair, { key: 'a'; value: number } | { key: 'b'; value: string }>>;

// The union is genuinely discriminated: narrowing by key gives the right value type.
declare const pair: Pair;
if (pair.key === 'a') {
  const n: number = pair.value;
}

// Nothing collapsed to never or any.
type _notNever = ExpectFalse<Equal<FunctionKeys<Store>, never>>;
type _notAny = ExpectFalse<IsAny<Methods<Store>>>;

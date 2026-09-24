import { isString, isUser, isNonNull, hasKey, describe, type User } from './solution';

// isString must narrow (inferred or annotated, either is fine).
declare const raw: unknown;
if (isString(raw)) {
  const upper: string = raw.toUpperCase();
  type _s = Expect<Equal<typeof raw, string>>;
}

// isUser must narrow unknown to exactly User. Inference alone cannot do this.
declare const input: unknown;
if (isUser(input)) {
  type _u = Expect<Equal<typeof input, User>>;
  const name: string = input.name;
}

// isNonNull must be generic enough to clean up an array's element type.
const mixed: (string | null | undefined)[] = ['a', null, 'b', undefined];
const clean = mixed.filter(isNonNull);
type _clean = Expect<Equal<typeof clean, string[]>>;

const maybeUsers: (User | null)[] = [];
const users = maybeUsers.filter(isNonNull);
type _users = Expect<Equal<typeof users, User[]>>;

// hasKey lets us read a property off unknown data without an assertion.
declare const payload: unknown;
if (hasKey(payload, 'id')) {
  const id: unknown = payload.id;
  if (isString(id)) {
    const asString: string = id;
  }
}

// describe returns a string for any input.
const d: string = describe(raw);
type _d = Expect<Equal<ReturnType<typeof describe>, string>>;

// No implicit any leaked out of the signatures.
type _noAnyString = ExpectFalse<IsAny<Parameters<typeof isString>[0]>>;
type _noAnyUser = ExpectFalse<IsAny<Parameters<typeof isUser>[0]>>;
type _noAnyDescribe = ExpectFalse<IsAny<ReturnType<typeof describe>>>;

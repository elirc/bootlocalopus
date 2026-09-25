import { enumOf, definePermissions } from './solution';
import type { PermissionOf } from './solution';

// --- enumOf keeps the literals without the caller writing `as const`
const Status = enumOf(['draft', 'published', 'archived']);
type Status = ReturnType<typeof Status.parse>;
type _status = Expect<Equal<Status, 'draft' | 'published' | 'archived'>>;
type _values = Expect<Equal<typeof Status.values, readonly ['draft', 'published', 'archived']>>;
// @ts-expect-error the values tuple is readonly
Status.values.push('deleted');

declare const input: unknown;
if (Status.is(input)) {
  type _narrowed = Expect<Equal<typeof input, 'draft' | 'published' | 'archived'>>;
}
const parsed = Status.parse(input);
// @ts-expect-error not one of the values
const bad: typeof parsed = 'deleted';

// An `as const` array from elsewhere is accepted too.
const SIZES = ['s', 'm', 'l'] as const;
const Size = enumOf(SIZES);
type _size = Expect<Equal<ReturnType<typeof Size.parse>, 's' | 'm' | 'l'>>;

// A mutable string[] variable has already lost its literals: it degrades, it does not break.
const loose: string[] = ['a', 'b'];
const Loose = enumOf(loose);
type _loose = Expect<Equal<ReturnType<typeof Loose.parse>, string>>;

// @ts-expect-error only strings
enumOf([1, 2, 3]);

// --- PermissionOf
type _p1 = Expect<Equal<PermissionOf<{ a: readonly ['x'] }>, 'a:x'>>;
type _p2 = Expect<Equal<
  PermissionOf<{ post: readonly ['read', 'write']; user: readonly ['ban'] }>,
  'post:read' | 'post:write' | 'user:ban'
>>;

// --- definePermissions derives the union from an object literal
const perms = definePermissions({ post: ['read', 'write'], comment: ['read', 'delete'] });
type Permission = (typeof perms.all)[number];
type _perm = Expect<Equal<Permission, 'post:read' | 'post:write' | 'comment:read' | 'comment:delete'>>;

const granted: Permission[] = ['post:read', 'comment:delete'];
const ok: boolean = perms.can(granted, 'post:read');
// @ts-expect-error posts cannot be deleted
perms.can(granted, 'post:delete');
// @ts-expect-error unknown permission in the granted list
perms.can(['post:publish'], 'post:read');
// A readonly granted list is fine.
const fromToken = ['comment:read'] as const;
perms.can(fromToken, 'comment:read');

// @ts-expect-error actions must be strings
definePermissions({ post: [1, 2] });

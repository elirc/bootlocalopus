import { ROLES, hasAtLeast, STATUSES, defineRoles } from './solution';
import type { Role, RoleLevel, Status } from './solution';

// Literal types survived: this is 3, not number.
type _adminLevel = Expect<Equal<typeof ROLES.admin.level, 3>>;
type _label = Expect<Equal<typeof ROLES.viewer.label, 'Viewer'>>;

type _role = Expect<Equal<Role, 'viewer' | 'editor' | 'admin'>>;
type _level = Expect<Equal<RoleLevel, 1 | 2 | 3>>;

const ok: boolean = hasAtLeast('editor', 'viewer');
// @ts-expect-error not a role
hasAtLeast('superuser', 'viewer');

// The config is deeply readonly.
// @ts-expect-error readonly
ROLES.admin.level = 9;

type _statuses = Expect<Equal<Status, 'todo' | 'doing' | 'done'>>;
type _tuple = Expect<Equal<typeof STATUSES, readonly ['todo', 'doing', 'done']>>;
// @ts-expect-error readonly tuple
STATUSES.push('extra');

const s: Status = 'doing';
// @ts-expect-error not a status
const bad: Status = 'shipped';

// defineRoles: the reusable form of satisfies.
const custom = defineRoles({ owner: { level: 7, label: 'Owner' } });
type _owner = Expect<Equal<typeof custom.owner.level, 7>>;
type _ownerLabel = Expect<Equal<typeof custom.owner.label, 'Owner'>>;
// @ts-expect-error level must be a number
defineRoles({ guest: { level: 'low', label: 'Guest' } });
// @ts-expect-error label is required
defineRoles({ guest: { level: 0 } });

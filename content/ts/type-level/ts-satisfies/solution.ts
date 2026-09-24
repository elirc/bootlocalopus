export const ROLES = {
  viewer: { level: 1, label: 'Viewer' },
  editor: { level: 2, label: 'Editor' },
  admin: { level: 3, label: 'Admin' },
  // `as const` keeps 1 | 2 | 3; `satisfies` still checks the shape.
} as const satisfies Record<string, { level: number; label: string }>;

export type Role = keyof typeof ROLES;
export type RoleLevel = (typeof ROLES)[Role]['level'];

export function hasAtLeast(role: Role, min: Role): boolean {
  return ROLES[role].level >= ROLES[min].level;
}

export const STATUSES = ['todo', 'doing', 'done'] as const;
export type Status = (typeof STATUSES)[number];

// satisfies, packaged for other call sites: the constraint checks the shape,
// the `const` type parameter keeps the literal types.
export function defineRoles<const T extends Record<string, { level: number; label: string }>>(roles: T): T {
  return roles;
}

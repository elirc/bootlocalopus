export const ROLES = {
  viewer: { level: 1, label: 'Viewer' },
  editor: { level: 2, label: 'Editor' },
  admin: { level: 3, label: 'Admin' },
};

export type Role = string;        // TODO: derive from ROLES
export type RoleLevel = number;   // TODO: derive from ROLES

export function hasAtLeast(role: Role, min: Role): boolean {
  return ROLES[role].level >= ROLES[min].level;
}

export const STATUSES = ['todo', 'doing', 'done'];
export type Status = string;      // TODO

// TODO: a generic identity function that checks the shape and keeps literals
export function defineRoles(roles: Record<string, { level: number; label: string }>) {
  return roles;
}

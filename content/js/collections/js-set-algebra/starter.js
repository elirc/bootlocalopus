export function effectivePermissions(user, roles) {
  return new Set();
}

export function missingPermissions(required, granted) {
  return [];
}

export function permissionChanges(before, after) {
  return { added: [], removed: [] };
}

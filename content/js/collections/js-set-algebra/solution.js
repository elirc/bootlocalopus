function roleGrants(start, roles) {
  const granted = new Set();
  const visited = new Set();
  const stack = [...start];
  while (stack.length > 0) {
    const name = stack.pop();
    if (visited.has(name)) continue; // resolves each role once, so cycles end here
    visited.add(name);
    const role = roles.get(name);
    if (!role) throw new Error(`unknown role: ${name}`);
    for (const p of role.grants) granted.add(p);
    stack.push(...(role.inherits ?? []));
  }
  return granted;
}

export function effectivePermissions(user, roles) {
  const fromRoles = roleGrants(user.roles, roles);
  return fromRoles
    .union(new Set(user.grants ?? []))
    .difference(new Set(user.denies ?? []));
}

function satisfied(permission, granted) {
  if (granted.has(permission) || granted.has('*')) return true;
  const colon = permission.indexOf(':');
  return colon !== -1 && granted.has(`${permission.slice(0, colon)}:*`);
}

export function missingPermissions(required, granted) {
  const missing = new Set();
  for (const p of required) {
    if (!satisfied(p, granted)) missing.add(p);
  }
  return [...missing];
}

export function permissionChanges(before, after) {
  return {
    added: [...after.difference(before)].toSorted(),
    removed: [...before.difference(after)].toSorted(),
  };
}

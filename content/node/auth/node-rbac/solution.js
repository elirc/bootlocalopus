export function createRbac(roles) {
  const has = (name) => typeof name === 'string' && Object.hasOwn(roles, name);

  for (const [name, role] of Object.entries(roles)) {
    for (const parent of role.inherits ?? []) {
      if (!has(parent)) throw new Error(`unknown role "${parent}" inherited by "${name}"`);
    }
  }

  // Depth-first resolution. `path` holds the roles on the current chain only,
  // so reaching a role twice through a diamond is fine; reaching one that is
  // still on the chain is a cycle.
  const resolved = new Map(); // role -> Set<permission>
  const resolve = (name, path) => {
    if (resolved.has(name)) return resolved.get(name);
    if (path.includes(name)) throw new Error(`role cycle: ${[...path, name].join(' -> ')}`);
    const role = roles[name];
    const perms = new Set(role.permissions ?? []);
    for (const parent of role.inherits ?? []) {
      for (const p of resolve(parent, [...path, name])) perms.add(p);
    }
    resolved.set(name, perms);
    return perms;
  };
  for (const name of Object.keys(roles)) resolve(name, []);

  const covers = (granted, wanted) =>
    granted === wanted ||
    granted === '*' ||
    (granted.endsWith(':*') && wanted.startsWith(granted.slice(0, -1)));

  return {
    permissionsOf(role) {
      return has(role) ? [...resolved.get(role)].sort() : [];
    },

    can(user, permission) {
      if (typeof permission !== 'string' || !Array.isArray(user?.roles)) return false;
      return user.roles.some((role) => has(role) && [...resolved.get(role)].some((g) => covers(g, permission)));
    },
  };
}

export function requirePermission(rbac, permission) {
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  return (req, res, next) => {
    if (!req.user) return send(res, 401, { error: 'unauthorized' });
    if (!rbac.can(req.user, permission)) return send(res, 403, { error: 'forbidden' });
    return next();
  };
}

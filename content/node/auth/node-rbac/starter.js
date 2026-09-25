export function createRbac(roles) {
  // TODO: validate `inherits` (unknown roles, cycles) and resolve each role's
  // effective permissions once, here.

  return {
    permissionsOf(role) {
      return roles[role]?.permissions ?? [];
    },

    can(user, permission) {
      throw new Error('not implemented');
    },
  };
}

export function requirePermission(rbac, permission) {
  return (req, res, next) => {
    // TODO: 401 without req.user, 403 without the permission, else next().
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  };
}

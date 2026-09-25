const { effectivePermissions, missingPermissions, permissionChanges } = solution;

const sorted = (set) => [...set].sort();

function makeRoles() {
  return new Map([
    ['viewer', { grants: ['orders:read', 'products:read'] }],
    ['editor', { grants: ['products:write'], inherits: ['viewer'] }],
    ['support', { grants: ['orders:refund', 'orders:read'] }],
    ['admin', { grants: ['users:write'], inherits: ['editor', 'support'] }],
  ]);
}

describe('effectivePermissions', () => {
  it('returns a Set of the role grants, with inheritance', () => {
    const out = effectivePermissions({ roles: ['editor'] }, makeRoles());
    expect(out).toBeInstanceOf(Set);
    expect(sorted(out)).toEqual(['orders:read', 'products:read', 'products:write']);
  });

  it('follows inheritance transitively and removes duplicates', () => {
    const out = effectivePermissions({ roles: ['admin'] }, makeRoles());
    expect(sorted(out)).toEqual(['orders:read', 'orders:refund', 'products:read', 'products:write', 'users:write']);
    expect(out.size).toBe(5);
  });

  it('adds the user\'s own grants and removes denies — a deny beats an inherited grant', () => {
    const user = { roles: ['admin'], grants: ['reports:read'], denies: ['orders:refund', 'reports:read'] };
    expect(sorted(effectivePermissions(user, makeRoles())))
      .toEqual(['orders:read', 'products:read', 'products:write', 'users:write']);
  });

  it('handles a user with no roles', () => {
    expect(sorted(effectivePermissions({ roles: [], grants: ['a:b'] }, makeRoles()))).toEqual(['a:b']);
  });

  it('survives inheritance cycles, including a role inheriting itself', () => {
    const roles = new Map([
      ['a', { grants: ['x:1'], inherits: ['b'] }],
      ['b', { grants: ['x:2'], inherits: ['c', 'a'] }],
      ['c', { grants: ['x:3'], inherits: ['c'] }],
    ]);
    expect(sorted(effectivePermissions({ roles: ['a'] }, roles))).toEqual(['x:1', 'x:2', 'x:3']);
  });

  it('throws on an unknown role, directly or through inherits', () => {
    expect(() => effectivePermissions({ roles: ['ghost'] }, makeRoles())).toThrow(/unknown role.*ghost/);
    const roles = makeRoles();
    roles.set('broken', { grants: [], inherits: ['viewer', 'phantom'] });
    expect(() => effectivePermissions({ roles: ['broken'] }, roles)).toThrow(/unknown role.*phantom/);
  });

  it('never mutates the roles or the user', () => {
    const roles = makeRoles();
    const user = { roles: ['admin'], grants: ['reports:read'], denies: ['users:write'] };
    const before = JSON.stringify([[...roles], user]);
    effectivePermissions(user, roles);
    effectivePermissions(user, roles);
    expect(JSON.stringify([[...roles], user])).toBe(before);
    expect(sorted(effectivePermissions({ roles: ['viewer'] }, roles))).toEqual(['orders:read', 'products:read']);
  });
});

describe('missingPermissions', () => {
  it('lists what is not granted, in required order, once each', () => {
    const granted = new Set(['orders:read', 'products:read']);
    expect(missingPermissions(['users:write', 'orders:read', 'orders:refund', 'users:write'], granted))
      .toEqual(['users:write', 'orders:refund']);
  });

  it('returns an empty array when everything is granted', () => {
    expect(missingPermissions(['a:b'], new Set(['a:b', 'c:d']))).toEqual([]);
    expect(missingPermissions([], new Set())).toEqual([]);
  });

  it('honours resource wildcards', () => {
    const granted = new Set(['orders:*']);
    expect(missingPermissions(['orders:read', 'orders:refund', 'products:read'], granted)).toEqual(['products:read']);
  });

  it('does not treat a prefix as a wildcard', () => {
    const granted = new Set(['orders:*']);
    expect(missingPermissions(['orders-archive:read', 'order:read'], granted)).toEqual(['orders-archive:read', 'order:read']);
  });

  it('honours the global "*" grant', () => {
    expect(missingPermissions(['anything:at-all', 'x:y'], new Set(['*']))).toEqual([]);
  });
});

describe('permissionChanges', () => {
  it('reports additions and removals as sorted arrays', () => {
    const before = new Set(['orders:read', 'users:write', 'b:x', 'a:x']);
    const after = new Set(['orders:read', 'reports:read', 'audit:read']);
    expect(permissionChanges(before, after)).toEqual({
      added: ['audit:read', 'reports:read'],
      removed: ['a:x', 'b:x', 'users:write'],
    });
  });

  it('reports nothing for equal sets and leaves them untouched', () => {
    const a = new Set(['x:1', 'x:2']);
    const b = new Set(['x:2', 'x:1']);
    expect(permissionChanges(a, b)).toEqual({ added: [], removed: [] });
    expect(sorted(a)).toEqual(['x:1', 'x:2']);
    expect(sorted(b)).toEqual(['x:1', 'x:2']);
  });
});

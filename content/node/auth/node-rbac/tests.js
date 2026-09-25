import http from 'node:http';

const ROLES = () => ({
  viewer: { permissions: ['invoice:read', 'customer:read'] },
  editor: { inherits: ['viewer'], permissions: ['invoice:write'] },
  billing: { inherits: ['viewer'], permissions: ['invoice:*'] },
  admin: { inherits: ['editor', 'billing'], permissions: ['user:manage'] },
  root: { permissions: ['*'] },
  auditor: { permissions: ['audit:read'] },
});

describe('createRbac validation', () => {
  it('rejects an unknown inherited role', () => {
    expect(() => solution.createRbac({ a: { inherits: ['ghost'] } })).toThrow('unknown role');
    expect(() => solution.createRbac({ a: { inherits: ['toString'] } })).toThrow('unknown role');
  });

  it('rejects direct and indirect cycles', () => {
    expect(() => solution.createRbac({ a: { inherits: ['a'] } })).toThrow('cycle');
    expect(() => solution.createRbac({
      a: { inherits: ['b'] }, b: { inherits: ['c'] }, c: { inherits: ['a'] }, d: {},
    })).toThrow('cycle');
    expect(() => solution.createRbac({
      ok: {}, a: { inherits: ['ok', 'b'] }, b: { inherits: ['a'] },
    })).toThrow('cycle');
  });

  it('accepts a diamond: two paths to the same role are not a cycle', () => {
    const rbac = solution.createRbac(ROLES());
    expect(rbac.permissionsOf('admin')).toEqual(['customer:read', 'invoice:*', 'invoice:read', 'invoice:write', 'user:manage']);
  });

  it('accepts a deep diamond declared in any order', () => {
    const rbac = solution.createRbac({
      top: { inherits: ['left', 'right'] },
      left: { inherits: ['base'], permissions: ['l:x'] },
      right: { inherits: ['mid'] },
      mid: { inherits: ['base'], permissions: ['m:x'] },
      base: { permissions: ['b:x'] },
    });
    expect(rbac.permissionsOf('top')).toEqual(['b:x', 'l:x', 'm:x']);
  });
});

describe('permissionsOf', () => {
  it('returns own plus inherited permissions, sorted and unique', () => {
    const rbac = solution.createRbac(ROLES());
    expect(rbac.permissionsOf('viewer')).toEqual(['customer:read', 'invoice:read']);
    expect(rbac.permissionsOf('editor')).toEqual(['customer:read', 'invoice:read', 'invoice:write']);
    expect(rbac.permissionsOf('auditor')).toEqual(['audit:read']);
  });

  it('returns [] for unknown and prototype names', () => {
    const rbac = solution.createRbac(ROLES());
    for (const r of ['nope', '__proto__', 'constructor', 'hasOwnProperty', undefined]) {
      expect(rbac.permissionsOf(r)).toEqual([]);
    }
  });

  it('handles roles with neither permissions nor inherits', () => {
    const rbac = solution.createRbac({ empty: {}, child: { inherits: ['empty'] } });
    expect(rbac.permissionsOf('child')).toEqual([]);
  });

  it('does not mutate the config it was given', () => {
    const roles = ROLES();
    const before = JSON.stringify(roles);
    const rbac = solution.createRbac(roles);
    rbac.permissionsOf('admin');
    rbac.can({ roles: ['admin'] }, 'invoice:read');
    expect(JSON.stringify(roles)).toBe(before);
  });
});

describe('can', () => {
  let rbac;
  beforeEach(() => { rbac = solution.createRbac(ROLES()); });

  it('grants direct and inherited permissions', () => {
    expect(rbac.can({ roles: ['viewer'] }, 'invoice:read')).toBe(true);
    expect(rbac.can({ roles: ['viewer'] }, 'invoice:write')).toBe(false);
    expect(rbac.can({ roles: ['editor'] }, 'customer:read')).toBe(true);
    expect(rbac.can({ roles: ['admin'] }, 'invoice:refund')).toBe(true);
    expect(rbac.can({ roles: ['admin'] }, 'audit:read')).toBe(false);
  });

  it('combines several roles', () => {
    expect(rbac.can({ roles: ['auditor', 'viewer'] }, 'audit:read')).toBe(true);
    expect(rbac.can({ roles: ['auditor', 'viewer'] }, 'invoice:read')).toBe(true);
  });

  it('matches resource wildcards on the whole resource name', () => {
    const u = { roles: ['billing'] };
    expect(rbac.can(u, 'invoice:refund')).toBe(true);
    expect(rbac.can(u, 'invoice:')).toBe(true);
    expect(rbac.can(u, 'invoices:refund')).toBe(false);
    expect(rbac.can(u, 'invoice-archive:read')).toBe(false);
    expect(rbac.can(u, 'invoice')).toBe(false);
  });

  it('does not let a concrete grant satisfy a wildcard request', () => {
    expect(rbac.can({ roles: ['editor'] }, 'invoice:*')).toBe(false);
    expect(rbac.can({ roles: ['billing'] }, 'invoice:*')).toBe(true);
  });

  it('treats * as everything', () => {
    expect(rbac.can({ roles: ['root'] }, 'anything:at-all')).toBe(true);
  });

  it('denies unknown roles, prototype names and malformed users', () => {
    for (const roles of [['ghost'], ['__proto__'], ['constructor'], ['toString'], []]) {
      expect(rbac.can({ roles }, 'invoice:read')).toBe(false);
    }
    expect(rbac.can({}, 'invoice:read')).toBe(false);
    expect(rbac.can({ roles: 'admin' }, 'invoice:read')).toBe(false);
    expect(rbac.can(undefined, 'invoice:read')).toBe(false);
    expect(rbac.can(null, 'invoice:read')).toBe(false);
  });

  it('does not grant through a permission string that merely contains the request', () => {
    const r = solution.createRbac({ odd: { permissions: ['invoice:read-all'] } });
    expect(r.can({ roles: ['odd'] }, 'invoice:read')).toBe(false);
  });
});

describe('requirePermission', () => {
  let rbac;
  beforeEach(() => { rbac = solution.createRbac(ROLES()); });

  const serve = async (user, permission) => {
    let reached = 0;
    const mw = solution.requirePermission(rbac, permission);
    const server = http.createServer((req, res) => {
      req.user = user;
      mw(req, res, () => {
        reached++;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
      return { status: res.status, type: res.headers.get('content-type'), body: await res.json(), reached };
    } finally {
      await new Promise((r) => server.close(r));
    }
  };

  it('401s without a user', async () => {
    const r = await serve(undefined, 'invoice:read');
    expect(r.status).toBe(401);
    expect(r.type).toMatch(/application\/json/);
    expect(r.body).toEqual({ error: 'unauthorized' });
    expect(r.reached).toBe(0);
  });

  it('403s without the permission', async () => {
    const r = await serve({ id: 'u1', roles: ['viewer'] }, 'invoice:write');
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'forbidden' });
    expect(r.reached).toBe(0);
  });

  it('passes through with it', async () => {
    const r = await serve({ id: 'u1', roles: ['editor'] }, 'invoice:write');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(r.reached).toBe(1);
  });
});

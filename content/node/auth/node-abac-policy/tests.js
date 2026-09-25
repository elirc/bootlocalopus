const rule = (id, effect, actions, when) => ({ id, effect, actions, when });
const req = (action, extra = {}) => ({ subject: { id: 's' }, action, resource: {}, context: {}, ...extra });

describe('createPolicy', () => {
  it('denies by default when nothing applies or matches', () => {
    const p = solution.createPolicy([rule('a', 'allow', ['edit'], () => true), rule('b', 'allow', ['read'], () => false)]);
    expect(p.evaluate(req('read'))).toEqual({ allowed: false, reason: 'default-deny' });
    expect(p.evaluate(req('delete'))).toEqual({ allowed: false, reason: 'default-deny' });
    expect(solution.createPolicy([]).evaluate(req('read'))).toEqual({ allowed: false, reason: 'default-deny' });
  });

  it('allows with the first matching allow rule as the reason', () => {
    const p = solution.createPolicy([
      rule('no', 'allow', ['read'], () => false),
      rule('first', 'allow', ['read'], () => true),
      rule('second', 'allow', ['*'], () => true),
    ]);
    expect(p.evaluate(req('read'))).toEqual({ allowed: true, reason: 'allow:first' });
    expect(p.evaluate(req('edit'))).toEqual({ allowed: true, reason: 'allow:second' });
  });

  it('lets a deny listed after an allow override it', () => {
    const p = solution.createPolicy([
      rule('owner', 'allow', ['edit'], () => true),
      rule('frozen', 'deny', ['edit'], () => true),
    ]);
    expect(p.evaluate(req('edit'))).toEqual({ allowed: false, reason: 'deny:frozen' });
  });

  it('reports the first deny in array order', () => {
    const p = solution.createPolicy([
      rule('ok', 'allow', ['*'], () => true),
      rule('d1', 'deny', ['read'], () => false),
      rule('d2', 'deny', ['*'], () => true),
      rule('d3', 'deny', ['read'], () => true),
    ]);
    expect(p.evaluate(req('read'))).toEqual({ allowed: false, reason: 'deny:d2' });
  });

  it('matches only on exactly true', () => {
    for (const value of [1, 'yes', {}, [], undefined, null, 'true']) {
      const p = solution.createPolicy([rule('loose', 'allow', ['read'], () => value), rule('loose-deny', 'deny', ['read'], () => value)]);
      expect(p.evaluate(req('read'))).toEqual({ allowed: false, reason: 'default-deny' });
    }
  });

  it('fails closed when a rule throws, even an allow rule', () => {
    const p = solution.createPolicy([
      rule('fine', 'allow', ['read'], () => true),
      rule('broken', 'allow', ['read'], (r) => r.resource.tags.includes('x')),
    ]);
    expect(p.evaluate(req('read'))).toEqual({ allowed: false, reason: 'error:broken' });
  });

  it('reports whichever comes first of an error and a deny', () => {
    const boom = () => { throw new Error('boom'); };
    const a = solution.createPolicy([rule('d', 'deny', ['read'], () => true), rule('e', 'allow', ['read'], boom)]);
    expect(a.evaluate(req('read'))).toEqual({ allowed: false, reason: 'deny:d' });
    const b = solution.createPolicy([rule('e', 'deny', ['read'], boom), rule('d', 'deny', ['read'], () => true)]);
    expect(b.evaluate(req('read'))).toEqual({ allowed: false, reason: 'error:e' });
  });

  it('does not call when() on rules that do not apply to the action', () => {
    let calls = 0;
    const p = solution.createPolicy([rule('other', 'deny', ['delete'], () => { calls++; throw new Error('no'); })]);
    expect(p.evaluate(req('read'))).toEqual({ allowed: false, reason: 'default-deny' });
    expect(calls).toBe(0);
  });

  it('passes the whole request to when()', () => {
    let seen;
    const p = solution.createPolicy([rule('spy', 'allow', ['read'], (r) => { seen = r; return true; })]);
    const r = req('read', { subject: { id: 'u9' }, resource: { ownerId: 'u9' }, context: { mfa: true } });
    p.evaluate(r);
    expect(seen).toEqual(r);
  });
});

/* A reference engine, so the rules are graded independently of the learner's engine. */
const referenceEvaluate = (rules, request) => {
  let allow;
  for (const r of rules) {
    if (!r.actions.includes(request.action) && !r.actions.includes('*')) continue;
    let m;
    try { m = r.when(request) === true; } catch { return { allowed: false, reason: 'error:' + r.id }; }
    if (!m) continue;
    if (r.effect === 'deny') return { allowed: false, reason: 'deny:' + r.id };
    allow ??= r;
  }
  return allow ? { allowed: true, reason: 'allow:' + allow.id } : { allowed: false, reason: 'default-deny' };
};

const alice = { id: 'alice', tenantId: 't1', role: 'member' };
const bob = { id: 'bob', tenantId: 't1', role: 'member' };
const admin = { id: 'ada', tenantId: 't1', role: 'admin' };
const outsider = { id: 'olga', tenantId: 't2', role: 'admin' };
const doc = (extra = {}) => ({ ownerId: 'alice', tenantId: 't1', status: 'draft', ...extra });

const decide = (subject, action, resource, mfa = false) => {
  const request = { subject, action, resource, context: { mfa } };
  const ref = referenceEvaluate(solution.documentRules, request);
  const mine = solution.createPolicy(solution.documentRules).evaluate(request);
  expect(mine).toEqual(ref);
  return ref;
};

describe('documentRules', () => {
  it('has the seven rules in order', () => {
    expect(solution.documentRules.map((r) => r.id)).toEqual([
      'cross-tenant', 'archived-read-only', 'delete-needs-mfa', 'owner', 'shared-read', 'published-read', 'tenant-admin',
    ]);
    expect(solution.documentRules.map((r) => r.effect)).toEqual(['deny', 'deny', 'deny', 'allow', 'allow', 'allow', 'allow']);
  });

  it('lets owners read, edit and (with MFA) delete their drafts', () => {
    expect(decide(alice, 'read', doc())).toEqual({ allowed: true, reason: 'allow:owner' });
    expect(decide(alice, 'edit', doc())).toEqual({ allowed: true, reason: 'allow:owner' });
    expect(decide(alice, 'delete', doc(), true)).toEqual({ allowed: true, reason: 'allow:owner' });
    expect(decide(alice, 'delete', doc(), false)).toEqual({ allowed: false, reason: 'deny:delete-needs-mfa' });
  });

  it('keeps other members out of a private draft', () => {
    expect(decide(bob, 'read', doc())).toEqual({ allowed: false, reason: 'default-deny' });
    expect(decide(bob, 'edit', doc())).toEqual({ allowed: false, reason: 'default-deny' });
  });

  it('handles documents with and without sharedWith', () => {
    expect(decide(bob, 'read', doc({ sharedWith: ['bob'] }))).toEqual({ allowed: true, reason: 'allow:shared-read' });
    expect(decide(bob, 'edit', doc({ sharedWith: ['bob'] }))).toEqual({ allowed: false, reason: 'default-deny' });
    expect(decide(bob, 'read', doc({ sharedWith: [] }))).toEqual({ allowed: false, reason: 'default-deny' });
    expect(decide(bob, 'read', doc({ status: 'published' }))).toEqual({ allowed: true, reason: 'allow:published-read' });
  });

  it('never lets an archived document be edited, even by its owner or an admin', () => {
    expect(decide(alice, 'edit', doc({ status: 'archived' }))).toEqual({ allowed: false, reason: 'deny:archived-read-only' });
    expect(decide(admin, 'edit', doc({ status: 'archived' }))).toEqual({ allowed: false, reason: 'deny:archived-read-only' });
    expect(decide(alice, 'read', doc({ status: 'archived' }))).toEqual({ allowed: true, reason: 'allow:owner' });
  });

  it('gives tenant admins everything in their own tenant only', () => {
    expect(decide(admin, 'edit', doc())).toEqual({ allowed: true, reason: 'allow:tenant-admin' });
    expect(decide(admin, 'delete', doc(), true)).toEqual({ allowed: true, reason: 'allow:tenant-admin' });
    expect(decide(outsider, 'read', doc({ status: 'published' }))).toEqual({ allowed: false, reason: 'deny:cross-tenant' });
    expect(decide(outsider, 'read', doc({ sharedWith: ['olga'] }))).toEqual({ allowed: false, reason: 'deny:cross-tenant' });
  });

  it('denies across tenants even for the owner id', () => {
    const moved = { ...alice, tenantId: 't2' };
    expect(decide(moved, 'read', doc())).toEqual({ allowed: false, reason: 'deny:cross-tenant' });
  });

  it('requires mfa to be exactly true', () => {
    const request = { subject: alice, action: 'delete', resource: doc(), context: { mfa: 'yes' } };
    expect(solution.createPolicy(solution.documentRules).evaluate(request)).toEqual({ allowed: false, reason: 'deny:delete-needs-mfa' });
  });
});

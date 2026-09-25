export function createPolicy(rules) {
  return {
    evaluate(request) {
      let firstAllow;
      for (const rule of rules) {
        if (!rule.actions.includes(request.action) && !rule.actions.includes('*')) continue;

        let matched;
        try {
          matched = rule.when(request) === true;
        } catch {
          // Fail closed: a rule that cannot decide is a deny.
          return { allowed: false, reason: `error:${rule.id}` };
        }
        if (!matched) continue;

        // Deny overrides allow, so an allow only remembers itself and we keep looking.
        if (rule.effect === 'deny') return { allowed: false, reason: `deny:${rule.id}` };
        if (rule.effect === 'allow') firstAllow ??= rule;
      }
      if (firstAllow) return { allowed: true, reason: `allow:${firstAllow.id}` };
      return { allowed: false, reason: 'default-deny' };
    },
  };
}

export const documentRules = [
  {
    id: 'cross-tenant',
    effect: 'deny',
    actions: ['*'],
    when: ({ subject, resource }) => subject.tenantId !== resource.tenantId,
  },
  {
    id: 'archived-read-only',
    effect: 'deny',
    actions: ['edit'],
    when: ({ resource }) => resource.status === 'archived',
  },
  {
    id: 'delete-needs-mfa',
    effect: 'deny',
    actions: ['delete'],
    when: ({ context }) => context?.mfa !== true,
  },
  {
    id: 'owner',
    effect: 'allow',
    actions: ['read', 'edit', 'delete'],
    when: ({ subject, resource }) => resource.ownerId === subject.id,
  },
  {
    id: 'shared-read',
    effect: 'allow',
    actions: ['read'],
    when: ({ subject, resource }) => Array.isArray(resource.sharedWith) && resource.sharedWith.includes(subject.id),
  },
  {
    id: 'published-read',
    effect: 'allow',
    actions: ['read'],
    when: ({ resource }) => resource.status === 'published',
  },
  {
    id: 'tenant-admin',
    effect: 'allow',
    actions: ['read', 'edit', 'delete'],
    when: ({ subject }) => subject.role === 'admin',
  },
];

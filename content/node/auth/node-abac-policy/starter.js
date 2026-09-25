export function createPolicy(rules) {
  return {
    evaluate(request) {
      // The bug this lesson is about: the first matching rule wins, so an
      // allow listed before a deny short-circuits it. Also: nothing matching
      // falls through to "allowed".
      for (const rule of rules) {
        if (!rule.actions.includes(request.action)) continue;
        if (rule.when(request)) return { allowed: rule.effect === 'allow', reason: `${rule.effect}:${rule.id}` };
      }
      return { allowed: true, reason: 'default-allow' };
    },
  };
}

export const documentRules = [
  // TODO: the seven rules from the brief, in order.
];

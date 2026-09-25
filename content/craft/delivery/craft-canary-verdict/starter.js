/**
 * Decides whether to promote, keep watching, or roll back a canary, from its
 * per-window checks (oldest first). Returns { verdict, reasons }.
 */
export function judgeCanary(checks, policy) {
  // The deploy tool today: no errors in the latest window means ship it.
  const latest = checks.at(-1);
  if (!latest) return { verdict: 'wait', reasons: [] };
  if (latest.canary.errors === 0) return { verdict: 'promote', reasons: [] };
  return { verdict: 'rollback', reasons: ['error-rate'] };
}

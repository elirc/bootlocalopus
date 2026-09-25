/**
 * Checks a parsed GitHub Actions workflow for the mistakes that cause CI
 * incidents. Returns [{ rule, where }], in any order.
 */
export function lintWorkflow(workflow) {
  const problems = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    if (!job['timeout-minutes']) problems.push({ rule: 'no-timeout', where: `jobs.${id}` });
  }
  // TODO: permissions, needs, cycles, pinning, untrusted input, pull_request_target.
  return problems;
}

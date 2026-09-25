const FULL_SHA = /^[0-9a-f]{40}$/;
const FIRST_PARTY = new Set(['actions', 'github']);
const EXPRESSION = /\$\{\{([\s\S]*?)\}\}/g;
const UNTRUSTED = /github\.head_ref\b|github\.event\.[\w.-]*\b(title|body|message|ref)\b(?![\w.])/;

const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

function triggers(on) {
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on;
  return Object.keys(on ?? {});
}

function isPinned(uses) {
  if (uses.startsWith('./') || uses.startsWith('docker://')) return true;
  const at = uses.lastIndexOf('@');
  if (at === -1) return false;
  const owner = uses.slice(0, at).split('/')[0];
  const ref = uses.slice(at + 1);
  return FIRST_PARTY.has(owner) || FULL_SHA.test(ref);
}

function interpolatesUntrusted(run) {
  for (const [, expr] of run.matchAll(EXPRESSION)) if (UNTRUSTED.test(expr)) return true;
  return false;
}

const isCheckout = (uses) => /^actions\/checkout(@|$)/.test(uses);

/** Jobs that can reach themselves by following `needs` (unknown names ignored). */
function jobsOnCycles(graph) {
  const onCycle = new Set();
  for (const start of graph.keys()) {
    const seen = new Set();
    const stack = [...graph.get(start)];
    while (stack.length) {
      const id = stack.pop();
      if (id === start) { onCycle.add(start); break; }
      if (seen.has(id) || !graph.has(id)) continue;
      seen.add(id);
      stack.push(...graph.get(id));
    }
  }
  return onCycle;
}

/**
 * Checks a parsed GitHub Actions workflow for the mistakes that cause CI
 * incidents. Returns [{ rule, where }], in any order.
 */
export function lintWorkflow(workflow) {
  const problems = [];
  const report = (rule, where) => problems.push({ rule, where });
  const jobs = workflow.jobs ?? {};
  const prTarget = triggers(workflow.on).includes('pull_request_target');

  if (!Object.hasOwn(workflow, 'permissions')) report('no-permissions', 'workflow');

  const graph = new Map(Object.entries(jobs).map(([id, job]) => [id, asList(job.needs)]));
  const cyclic = jobsOnCycles(graph);

  for (const [id, job] of Object.entries(jobs)) {
    const where = `jobs.${id}`;
    if (graph.get(id).some((need) => !graph.has(need))) report('unknown-need', where);
    if (cyclic.has(id)) report('needs-cycle', where);
    if (job['timeout-minutes'] === undefined) report('no-timeout', where);

    (job.steps ?? []).forEach((step, i) => {
      const at = `${where}.steps[${i}]`;
      if (typeof step.uses === 'string') {
        if (!isPinned(step.uses)) report('unpinned-action', at);
        if (prTarget && isCheckout(step.uses) && String(step.with?.ref ?? '').includes('github.event.pull_request.head')) {
          report('pr-target-checkout', at);
        }
      }
      if (typeof step.run === 'string' && interpolatesUntrusted(step.run)) report('untrusted-input', at);
    });
  }
  return problems;
}

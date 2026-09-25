// A first attempt: adds up every JavaScript file in the build.
export function checkBudget(manifest, sizes, budgets) {
  const total = Object.values(manifest).reduce((sum, chunk) => sum + sizes[chunk.file], 0);
  const violations = total > budgets.initialJs
    ? [{ kind: 'initial-js', entry: 'all', size: total, budget: budgets.initialJs }]
    : [];
  return { entries: [], violations, ok: violations.length === 0 };
}

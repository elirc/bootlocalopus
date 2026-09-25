function sizeOf(sizes, file) {
  if (!Object.hasOwn(sizes, file)) throw new Error(`No size for ${file}`);
  return sizes[file];
}

/** Every chunk key reachable through static imports, the start included. Safe on cycles. */
function staticClosure(manifest, start) {
  const seen = new Set();
  const stack = [start];
  while (stack.length > 0) {
    const key = stack.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    // dynamicImports are loaded later, on demand: not part of the initial cost.
    for (const next of manifest[key]?.imports ?? []) stack.push(next);
  }
  return [...seen];
}

export function checkBudget(manifest, sizes, budgets) {
  const entries = [];
  const violations = [];

  for (const [name, chunk] of Object.entries(manifest)) {
    if (!chunk.isEntry) continue;
    const chunks = staticClosure(manifest, name).map((key) => manifest[key]).filter(Boolean);

    // Sets, because two chunks can share a file (or a stylesheet).
    const jsFiles = new Set(chunks.map((c) => c.file));
    const cssFiles = new Set(chunks.flatMap((c) => c.css ?? []));
    const js = [...jsFiles].reduce((sum, file) => sum + sizeOf(sizes, file), 0);
    const css = [...cssFiles].reduce((sum, file) => sum + sizeOf(sizes, file), 0);
    entries.push({ name, js, css, files: [...jsFiles].sort() });

    if (budgets.initialJs !== undefined && js > budgets.initialJs) {
      violations.push({ kind: 'initial-js', entry: name, size: js, budget: budgets.initialJs });
    }
    if (budgets.initialCss !== undefined && css > budgets.initialCss) {
      violations.push({ kind: 'initial-css', entry: name, size: css, budget: budgets.initialCss });
    }
  }

  if (budgets.chunk !== undefined) {
    const files = [...new Set(Object.values(manifest).map((c) => c.file))].sort();
    for (const file of files) {
      const size = sizeOf(sizes, file);
      if (size > budgets.chunk) violations.push({ kind: 'chunk', file, size, budget: budgets.chunk });
    }
  }

  return { entries, violations, ok: violations.length === 0 };
}

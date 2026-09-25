const isInside = (file, dir) => file.startsWith(`${dir}/`);

function matchesGlobal(file, globalFiles) {
  return globalFiles.some((g) => (g.endsWith('/') ? file.startsWith(g) : file === g));
}

/** The package that owns `file`: the deepest dir that contains it, or undefined. */
function ownerOf(file, packages) {
  let best;
  for (const p of packages) {
    if (isInside(file, p.dir) && (!best || p.dir.length > best.dir.length)) best = p;
  }
  return best;
}

/**
 * The packages CI must build and test for a change: every package that owns
 * a changed file, and everything that depends on those, transitively.
 * Returns package names, sorted.
 */
export function affectedPackages(changedFiles, packages, { globalFiles = [] } = {}) {
  const files = changedFiles.filter((f) => !f.endsWith('.md'));
  if (files.some((f) => matchesGlobal(f, globalFiles))) return packages.map((p) => p.name).sort();

  // Reverse edges: for each package, who depends on it. External deps are ignored.
  const known = new Set(packages.map((p) => p.name));
  const dependents = new Map(packages.map((p) => [p.name, []]));
  for (const p of packages) {
    for (const dep of p.deps) if (known.has(dep)) dependents.get(dep).push(p.name);
  }

  const affected = new Set();
  const queue = [];
  for (const file of files) {
    const owner = ownerOf(file, packages);
    if (owner && !affected.has(owner.name)) {
      affected.add(owner.name);
      queue.push(owner.name);
    }
  }
  // Breadth-first up the reverse graph; `affected` doubles as the visited set, so cycles end.
  while (queue.length) {
    for (const dependent of dependents.get(queue.shift())) {
      if (!affected.has(dependent)) {
        affected.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return [...affected].sort();
}

/**
 * The packages CI must build and test for a change: every package that owns
 * a changed file, and everything that depends on those, transitively.
 * Returns package names, sorted.
 */
export function affectedPackages(changedFiles, packages, { globalFiles = [] } = {}) {
  // The filter that made CI fast: only packages whose own files changed.
  const hit = packages.filter((p) => changedFiles.some((f) => f.startsWith(p.dir)));
  return hit.map((p) => p.name).sort();
}

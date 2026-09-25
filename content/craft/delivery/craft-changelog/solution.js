const TYPE_SECTIONS = [
  ['feat', 'Features'],
  ['fix', 'Bug fixes'],
  ['perf', 'Performance'],
];

const ref = (c) => (c.pr !== null && c.pr !== undefined ? `#${c.pr}` : c.sha.slice(0, 7));
const entry = (c, text) => `- ${c.scope ? `**${c.scope}:** ` : ''}${text} (${ref(c)})`;

/** Scoped entries first, by scope; unscoped last. Array#sort is stable, so ties keep commit order. */
function byScope(a, b) {
  if (!a.scope || !b.scope) return (a.scope ? 0 : 1) - (b.scope ? 0 : 1);
  return a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : 0;
}

/**
 * Release notes for `version`, released on `date`, from the parsed commits
 * since the last release (oldest first).
 */
export function renderChangelog(version, date, commits) {
  // A revert and the commit it reverts, both in this release, cancel out.
  const shas = new Set(commits.map((c) => c.sha));
  const cancelled = new Set();
  for (const c of commits) {
    if (c.type === 'revert' && c.reverts && shas.has(c.reverts)) {
      cancelled.add(c.sha);
      cancelled.add(c.reverts);
    }
  }
  const shipped = commits.filter((c) => !cancelled.has(c.sha));

  const sections = [];
  const add = (title, items, text) => {
    if (items.length) sections.push([`### ${title}`, '', ...[...items].sort(byScope).map((c) => entry(c, text(c)))].join('\n'));
  };

  add('Breaking changes', shipped.filter((c) => c.breaking), (c) => c.breakingNote ?? c.description);
  for (const [type, title] of TYPE_SECTIONS) add(title, shipped.filter((c) => c.type === type), (c) => c.description);
  add('Reverts', shipped.filter((c) => c.type === 'revert'), (c) => c.description);

  const body = sections.length ? sections.join('\n\n') : 'No user-facing changes.';
  return `## ${version} (${date})\n\n${body}\n`;
}

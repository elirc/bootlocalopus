/**
 * Release notes for `version`, released on `date`, from the parsed commits
 * since the last release (oldest first).
 */
export function renderChangelog(version, date, commits) {
  // What the release script does today: one line per commit, as it came.
  const lines = commits.map((c) => `- ${c.type}: ${c.description}`);
  return `## ${version} (${date})\n\n${lines.join('\n')}\n`;
}

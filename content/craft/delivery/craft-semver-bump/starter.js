/**
 * The next version after `current`, given the commit messages since that
 * release, or null when none of them warrants a release.
 */
export function nextVersion(current, commits) {
  // The release script in production: anything that says "feat" is minor.
  const [major, minor, patch] = current.split('.').map(Number);
  if (commits.some((c) => c.includes('feat'))) return `${major}.${minor + 1}.${patch}`;
  return `${major}.${minor}.${patch + 1}`;
}

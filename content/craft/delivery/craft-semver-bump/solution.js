const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HEADER = /^([a-z]+)(\([^()]*\))?(!)?: \S/i;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /;

const RANK = { none: 0, patch: 1, minor: 2, major: 3 };

/** What one commit message asks for: 'major' | 'minor' | 'patch' | 'none'. */
function bumpFor(message) {
  const [header, ...body] = message.split('\n');
  const match = HEADER.exec(header);
  if (!match) return 'none';
  const [, type, , bang] = match;
  if (bang || body.some((line) => BREAKING_FOOTER.test(line))) return 'major';
  const t = type.toLowerCase();
  if (t === 'feat') return 'minor';
  if (t === 'fix' || t === 'perf') return 'patch';
  return 'none';
}

/**
 * The next version after `current`, given the commit messages since that
 * release, or null when none of them warrants a release.
 */
export function nextVersion(current, commits) {
  const parts = VERSION.exec(current);
  if (!parts) throw new TypeError(`not a MAJOR.MINOR.PATCH version: ${JSON.stringify(current)}`);
  const [major, minor, patch] = parts.slice(1).map(Number);

  let bump = commits.map(bumpFor).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'none');
  if (bump === 'none') return null;
  // Before 1.0.0 the public API is not stable yet: breaking changes bump the minor.
  if (bump === 'major' && major === 0) bump = 'minor';

  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

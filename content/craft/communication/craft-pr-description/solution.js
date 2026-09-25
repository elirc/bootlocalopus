const REQUIRED = ['What', 'Why', 'How to test'];
const PLACEHOLDER = /^(todo|tbd|n\/a)$/i;
const TICKET = /\b[A-Z][A-Z0-9]+-\d+\b/;
const UI_FILE = /\.(tsx|jsx|css|scss)$/;
const IMAGE = /!\[[^\]]*\]\([^)]*\)|<img/i;

/** Section name (lower-cased) -> its content, for `## ` and `### ` headings. */
function sectionsOf(text) {
  const sections = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = /^#{2,3} (.*)$/.exec(line);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      sections.set(current, []);
    } else if (line.startsWith('#')) {
      current = null; // any other heading ends the section
    } else if (current !== null) {
      sections.get(current).push(line);
    }
  }
  return new Map([...sections].map(([name, lines]) => [name, lines.join('\n').trim()]));
}

const isEmpty = (content) => content === '' || PLACEHOLDER.test(content);

/**
 * Reviews a pull request description. Returns [{ rule, detail }] in the
 * order the brief gives, or [] when it is good to go.
 */
export function reviewPrDescription(body, { changedFiles = [], labels = [] } = {}) {
  // Template hints are not content: every rule works on the body without them.
  const text = body.replace(/<!--[\s\S]*?-->/g, '');
  const sections = sectionsOf(text);
  const problems = [];
  const report = (rule, detail = null) => problems.push({ rule, detail });

  for (const name of REQUIRED) {
    const content = sections.get(name.toLowerCase());
    if (content === undefined) report('missing-section', name);
    else if (isEmpty(content)) report('empty-section', name);
  }

  if (!TICKET.test(text) && !labels.includes('no-ticket')) report('no-ticket');

  if (changedFiles.some((f) => UI_FILE.test(f)) && !IMAGE.test(text)) report('no-screenshot');

  const touchesMigrations = changedFiles.some((f) => f.split('/').slice(0, -1).includes('migrations'));
  const rollback = sections.get('rollback');
  if (touchesMigrations && (rollback === undefined || isEmpty(rollback))) report('no-rollback');

  for (const line of text.split('\n')) {
    const box = /^\s*- \[ \] (.*)$/.exec(line);
    if (box) report('unchecked-box', box[1].trim());
  }
  return problems;
}

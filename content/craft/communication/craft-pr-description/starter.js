/**
 * Reviews a pull request description. Returns [{ rule, detail }] in the
 * order the brief gives, or [] when it is good to go.
 */
export function reviewPrDescription(body, { changedFiles = [], labels = [] } = {}) {
  // The first version of the bot: it only checks the headings are there.
  const problems = [];
  for (const name of ['What', 'Why', 'How to test']) {
    if (!body.includes(`## ${name}`)) problems.push({ rule: 'missing-section', detail: name });
  }
  return problems;
}

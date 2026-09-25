const ITEM = /^\s*- \[( |x|X)\] (.*)$/;
const OWNER = /@([A-Za-z0-9_-]+)/;
const DUE = /\(due (\d{4}-\d{2}-\d{2})\)|\bdue (\d{4}-\d{2}-\d{2})/i;
const VAGUE = /^(look into|investigate|think about|consider|discuss|follow up)\b/i;
const UNASSIGNED = '(unassigned)';

/** True when 'YYYY-MM-DD' is a real calendar date. */
function isRealDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function parseItem(line, today) {
  const [, box, rest] = ITEM.exec(line);
  const done = box !== ' ';

  const ownerMatch = OWNER.exec(rest);
  const dueMatch = DUE.exec(rest);
  let text = rest;
  if (ownerMatch) text = text.replace(ownerMatch[0], '');
  if (dueMatch) text = text.replace(dueMatch[0], '');
  text = text.replace(/\s+/g, ' ').trim();

  const owner = ownerMatch ? ownerMatch[1].toLowerCase() : null;
  const due = dueMatch ? dueMatch[1] ?? dueMatch[2] : null;

  const problems = [];
  if (!done) {
    if (!owner) problems.push('no-owner');
    if (!due) problems.push('no-due-date');
    else if (!isRealDate(due)) problems.push('bad-due-date');
    else if (due < today) problems.push('overdue'); // 'YYYY-MM-DD' strings sort as dates
    if (VAGUE.test(text)) problems.push('vague');
  }
  return { owner, text, due, done, problems };
}

/**
 * Reads meeting notes and returns every action item, with what is wrong with
 * the open ones, and the open items grouped by owner.
 */
export function extractActionItems(notes, { today }) {
  const items = notes
    .split('\n')
    .filter((line) => ITEM.test(line))
    .map((line) => parseItem(line, today));

  const openByOwner = {};
  for (const item of items) {
    if (item.done) continue;
    const key = item.owner ?? UNASSIGNED;
    (openByOwner[key] ??= []).push(item.text);
  }
  return { items, openByOwner };
}

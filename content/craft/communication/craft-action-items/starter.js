/**
 * Reads meeting notes and returns every action item, with what is wrong with
 * the open ones, and the open items grouped by owner.
 */
export function extractActionItems(notes, { today }) {
  // The bot's first version: collects the checkbox lines and nothing else.
  const items = notes
    .split('\n')
    .filter((line) => line.startsWith('- [ ] '))
    .map((line) => ({ owner: null, text: line.slice(6), due: null, done: false, problems: [] }));
  return { items, openByOwner: {} };
}

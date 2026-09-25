// Same behaviour: 'en-CA' formats as YYYY-MM-DD directly, and the day count
// comes from Date objects built at UTC midnight.
export function dueLabel(dueDate, options = {}) {
  const now = options.now ?? (() => Date.now());
  const timeZone = options.timeZone ?? 'UTC';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now()));
  const days = Math.round((new Date(`${dueDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86_400_000);
  switch (true) {
    case days < -1: return `overdue by ${-days} days`;
    case days === -1: return 'overdue by 1 day';
    case days === 0: return 'due today';
    case days === 1: return 'due tomorrow';
    default: return `due in ${days} days`;
  }
}

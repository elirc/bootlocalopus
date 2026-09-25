const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar date ('YYYY-MM-DD') that the instant `ms` falls on in `timeZone`. */
function calendarDate(ms, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Whole days between two calendar dates, ignoring time of day and DST. */
function daysBetween(fromYmd, toYmd) {
  const utcMidnight = (ymd) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
  return Math.round((utcMidnight(toYmd) - utcMidnight(fromYmd)) / DAY_MS);
}

/**
 * A label for a task due on the calendar date `dueDate` ('YYYY-MM-DD'), as
 * seen by a user in `timeZone` at the instant `now()` returns.
 */
export function dueLabel(dueDate, { now = Date.now, timeZone = 'UTC' } = {}) {
  const today = calendarDate(now(), timeZone);
  const days = Number(dueDate.slice(8, 10)) - Number(today.slice(8, 10));
  if (days < 0) return days === -1 ? 'overdue by 1 day' : `overdue by ${-days} days`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

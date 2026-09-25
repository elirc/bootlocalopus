// Same behaviour with a mutable UTC Date and setUTCDate.
const WEEKDAYS = [1, 2, 3, 4, 5];

export function addBusinessDays(isoDate, n, options = {}) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new TypeError('bad date');
  if (typeof n !== 'number' || !Number.isInteger(n)) throw new RangeError('bad n');
  const holidays = options.holidays ?? [];
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const format = () => date.toISOString().slice(0, 10);

  let left = n;
  while (left !== 0) {
    const dir = Math.sign(left);
    date.setUTCDate(date.getUTCDate() + dir);
    if (WEEKDAYS.includes(date.getUTCDay()) && !holidays.includes(format())) left -= dir;
  }
  return format();
}

// Every one of these is the version that ships first. Each is wrong somewhere.

export function startOfDayInZone(date, timeZone) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0); // the SERVER's midnight, not the zone's
  return d;
}

export function sameTimeTomorrow(date, timeZone) {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000); // wrong twice a year
}

export function addMonths(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n); // 31 Jan + 1 month = 3 March
  return d.toISOString().slice(0, 10);
}

export function parseInstant(text) {
  return new Date(text); // accepts anything, including local times
}

export function formatPrice(minor, currency, locale) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
}

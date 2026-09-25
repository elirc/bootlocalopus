// A first attempt: adds up every shift on the page.
export function cumulativeLayoutShift(entries) {
  const value = entries.reduce((sum, e) => sum + e.value, 0);
  return { value, start: null, end: null, count: entries.length, largestTarget: null };
}

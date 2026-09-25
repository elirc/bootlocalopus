const MAX_GAP_MS = 1000;
const MAX_WINDOW_MS = 5000;

export function cumulativeLayoutShift(entries) {
  // Shifts right after input are expected; they do not count or extend a window.
  const shifts = entries.filter((e) => !e.hadRecentInput).sort((a, b) => a.startTime - b.startTime);

  const windows = [];
  let current = null;
  for (const shift of shifts) {
    const joins = current !== null
      && shift.startTime - current.last.startTime < MAX_GAP_MS
      && shift.startTime - current.first.startTime < MAX_WINDOW_MS;
    if (!joins) {
      current = { first: shift, last: shift, value: 0, shifts: [] };
      windows.push(current);
    }
    current.last = shift;
    current.value += shift.value;
    current.shifts.push(shift);
  }

  // CLS is the worst window, not the sum of all of them. Ties: the earlier one.
  let worst = null;
  for (const w of windows) if (worst === null || w.value > worst.value) worst = w;
  if (worst === null) return { value: 0, start: null, end: null, count: 0, largestTarget: null };

  let largest = worst.shifts[0];
  for (const shift of worst.shifts) if (shift.value > largest.value) largest = shift;

  return {
    value: worst.value,
    start: worst.first.startTime,
    end: worst.last.startTime,
    count: worst.shifts.length,
    largestTarget: largest.target,
  };
}

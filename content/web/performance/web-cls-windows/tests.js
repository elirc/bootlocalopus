const { cumulativeLayoutShift } = solution;
const shift = (startTime, value, target = '#el', hadRecentInput = false) => ({ startTime, value, target, hadRecentInput });
const EMPTY = { value: 0, start: null, end: null, count: 0, largestTarget: null };

describe('windows', () => {
  it('groups shifts less than 1 s apart and reports the window', () => {
    expect(cumulativeLayoutShift([shift(100, 0.125, '#hero'), shift(600, 0.25, '#banner'), shift(1500, 0.0625, '#footer')]))
      .toEqual({ value: 0.4375, start: 100, end: 1500, count: 3, largestTarget: '#banner' });
  });

  it('starts a new window after a gap of 1 s or more, and returns the worst one', () => {
    const result = cumulativeLayoutShift([
      shift(100, 0.125, '#a'), shift(1100, 0.25, '#b'), shift(1200, 0.25, '#c'), shift(9000, 0.0625, '#d'),
    ]);
    expect(result).toEqual({ value: 0.5, start: 1100, end: 1200, count: 2, largestTarget: '#b' });
  });

  it('caps a window at 5 s from its first shift', () => {
    const entries = [];
    for (let t = 0; t <= 6000; t += 500) entries.push(shift(t, 0.0625, `#s${t}`));
    const result = cumulativeLayoutShift(entries);
    // 0, 500, …, 4500 fit (4500 - 0 < 5000); 5000 starts the next window.
    expect(result).toEqual({ value: 0.625, start: 0, end: 4500, count: 10, largestTarget: '#s0' });
  });

  it('is the worst window, not the sum of all shifts', () => {
    const entries = [shift(0, 0.25), shift(2000, 0.25), shift(4000, 0.25), shift(6000, 0.25)];
    expect(cumulativeLayoutShift(entries).value).toBe(0.25);
  });

  it('prefers the earlier window on a tie', () => {
    const result = cumulativeLayoutShift([shift(0, 0.25, '#first'), shift(3000, 0.125, '#x'), shift(3100, 0.125, '#y')]);
    expect(result).toEqual({ value: 0.25, start: 0, end: 0, count: 1, largestTarget: '#first' });
  });
});

describe('input and order', () => {
  it('ignores shifts after input: they neither count nor extend a window', () => {
    const result = cumulativeLayoutShift([
      shift(0, 0.125, '#a'),
      shift(800, 0.5, '#typed', true),
      shift(1600, 0.125, '#b'),
    ]);
    // Without the input shift, 0 and 1600 are 1.6 s apart: two windows.
    expect(result).toEqual({ value: 0.125, start: 0, end: 0, count: 1, largestTarget: '#a' });
  });

  it('sorts by startTime without changing the input', () => {
    const entries = [shift(900, 0.25, '#late'), shift(100, 0.125, '#early'), shift(5000, 0.0625, '#z')];
    const copy = entries.map((e) => ({ ...e }));
    expect(cumulativeLayoutShift(entries)).toEqual({ value: 0.375, start: 100, end: 900, count: 2, largestTarget: '#late' });
    expect(entries).toEqual(copy);
  });

  it('names the first of equally large shifts', () => {
    expect(cumulativeLayoutShift([shift(0, 0.125, '#one'), shift(10, 0.125, '#two')]).largestTarget).toBe('#one');
  });

  it('returns an empty result when nothing counts', () => {
    expect(cumulativeLayoutShift([])).toEqual(EMPTY);
    expect(cumulativeLayoutShift([shift(0, 0.5, '#x', true)])).toEqual(EMPTY);
  });
});

describe('boundaries', () => {
  it('a gap of exactly 1000 ms starts a new window', () => {
    const result = cumulativeLayoutShift([shift(0, 0.125), shift(1000, 0.25, '#next')]);
    expect(result).toEqual({ value: 0.25, start: 1000, end: 1000, count: 1, largestTarget: '#next' });
  });

  it('a gap of 999.9 ms joins the window', () => {
    expect(cumulativeLayoutShift([shift(0, 0.125), shift(999.9, 0.25)]).count).toBe(2);
  });
});

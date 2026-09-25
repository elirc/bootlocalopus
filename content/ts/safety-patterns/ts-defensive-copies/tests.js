const { Schedule } = solution;

const at = (iso) => new Date(iso);
const isoOf = (schedule) => schedule.slots.map((d) => d.toISOString());

const MON = '2024-06-03T09:00:00.000Z';
const TUE = '2024-06-04T09:00:00.000Z';
const WED = '2024-06-05T09:00:00.000Z';

describe('create', () => {
  it('sorts slots and drops duplicates by time', () => {
    const s = Schedule.create('standup', [at(WED), at(MON), at(TUE), at(MON)]);
    expect(s.name).toBe('standup');
    expect(isoOf(s)).toEqual([MON, TUE, WED]);
    expect(s.size).toBe(3);
  });

  it('rejects an invalid date with a RangeError', () => {
    expect(() => Schedule.create('x', [at('not a date')])).toThrow(RangeError);
  });

  it('accepts any iterable of dates', () => {
    const s = Schedule.create('x', new Set([at(TUE), at(MON)]));
    expect(isoOf(s)).toEqual([MON, TUE]);
  });

  it('is not affected when the caller later mutates the array it passed', () => {
    const input = [at(MON)];
    const s = Schedule.create('x', input);
    input.push(at(TUE));
    input.length = 0;
    expect(isoOf(s)).toEqual([MON]);
  });

  it('is not affected when the caller later mutates a Date it passed', () => {
    const monday = at(MON);
    const s = Schedule.create('x', [monday]);
    monday.setUTCFullYear(1999);
    expect(isoOf(s)).toEqual([MON]);
  });
});

describe('reading', () => {
  it('hands out a frozen array', () => {
    const s = Schedule.create('x', [at(MON)]);
    const slots = s.slots;
    expect(Object.isFrozen(slots)).toBe(true);
    expect(() => slots.push(at(TUE))).toThrow(TypeError);
    expect(s.size).toBe(1);
  });

  it('hands out copies: mutating a returned Date changes nothing', () => {
    const s = Schedule.create('x', [at(MON), at(TUE)]);
    s.slots[0].setUTCFullYear(1999);
    expect(isoOf(s)).toEqual([MON, TUE]);
    expect(s.slots[0]).not.toBe(s.slots[0]);
  });

  it('next returns the first slot strictly after, as a copy', () => {
    const s = Schedule.create('x', [at(MON), at(TUE), at(WED)]);
    expect(s.next(at(MON)).toISOString()).toBe(TUE);
    expect(s.next(at('2024-01-01T00:00:00.000Z')).toISOString()).toBe(MON);
    expect(s.next(at(WED))).toBeUndefined();
    s.next(at(MON)).setUTCFullYear(1999);
    expect(isoOf(s)).toEqual([MON, TUE, WED]);
  });

  it('serialises to ISO strings', () => {
    const s = Schedule.create('standup', [at(TUE), at(MON)]);
    expect(JSON.parse(JSON.stringify(s))).toEqual({ name: 'standup', slots: [MON, TUE] });
  });
});

describe('updating returns new schedules', () => {
  it('withSlot adds in order and leaves the original alone', () => {
    const before = Schedule.create('x', [at(MON), at(WED)]);
    const after = before.withSlot(at(TUE));
    expect(after).not.toBe(before);
    expect(isoOf(after)).toEqual([MON, TUE, WED]);
    expect(isoOf(before)).toEqual([MON, WED]);
  });

  it('withSlot ignores a duplicate time', () => {
    const s = Schedule.create('x', [at(MON)]).withSlot(at(MON));
    expect(isoOf(s)).toEqual([MON]);
  });

  it('withSlot copies the date it is given', () => {
    const tuesday = at(TUE);
    const s = Schedule.create('x', [at(MON)]).withSlot(tuesday);
    tuesday.setUTCFullYear(1999);
    expect(isoOf(s)).toEqual([MON, TUE]);
  });

  it('withSlot rejects an invalid date', () => {
    expect(() => Schedule.create('x', []).withSlot(at('nope'))).toThrow(RangeError);
  });

  it('withoutSlot removes by time, not by identity', () => {
    const before = Schedule.create('x', [at(MON), at(TUE)]);
    const after = before.withoutSlot(at(MON));
    expect(isoOf(after)).toEqual([TUE]);
    expect(isoOf(before)).toEqual([MON, TUE]);
    expect(after.name).toBe('x');
  });
});

describe('encapsulation', () => {
  it('cannot be renamed from outside', () => {
    const s = Schedule.create('x', [at(MON)]);
    try { s.name = 'renamed'; } catch { /* a getter-only property throws in strict mode */ }
    expect(s.name).toBe('x');
  });
});

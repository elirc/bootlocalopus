const { allocate, splitEvenly } = solution;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Small deterministic PRNG so the property test is reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('allocate: the examples', () => {
  it('splits 100 three ways as 34, 33, 33', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('breaks a remainder tie in favour of the earlier share', () => {
    expect(allocate(5, [3, 7])).toEqual([2, 3]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
  });

  it('gives the leftover to the largest remainder, not simply the first share', () => {
    expect(allocate(10, [1, 0, 2])).toEqual([3, 0, 7]); // 3.33 and 6.67
    expect(allocate(10, [2, 1])).toEqual([7, 3]);
    expect(allocate(100, [1, 2, 3])).toEqual([17, 33, 50]); // 16.67, 33.33, 50
  });

  it('is exact when the ratios divide evenly', () => {
    expect(allocate(1000, [70, 20, 10])).toEqual([700, 200, 100]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
  });

  it('never gives anything to a zero ratio', () => {
    expect(allocate(7, [0, 1, 0, 1, 0])).toEqual([0, 4, 0, 3, 0]);
    expect(allocate(99, [0, 5])).toEqual([0, 99]);
  });

  it('hands out single units when the amount is smaller than the number of shares', () => {
    expect(allocate(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(allocate(3, [1, 1, 1, 1, 1])).toEqual([1, 1, 1, 0, 0]);
  });
});

describe('allocate: negatives', () => {
  it('mirrors the positive allocation', () => {
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocate(-5, [3, 7])).toEqual([-2, -3]);
  });

  it('never returns -0', () => {
    const out = allocate(-1, [1, 1, 1]);
    expect(out).toEqual([-1, 0, 0]);
    expect(Object.is(out[1], 0)).toBe(true);
    expect(Object.is(allocate(-5, [0, 1])[0], 0)).toBe(true);
  });
});

describe('allocate: invariants', () => {
  it('always sums to the amount and stays within one unit of the exact share', () => {
    const rand = rng(42);
    for (let run = 0; run < 400; run++) {
      const n = 1 + Math.floor(rand() * 8);
      const ratios = Array.from({ length: n }, () => Math.floor(rand() * 50));
      if (sum(ratios) === 0) ratios[0] = 1;
      const amount = Math.floor((rand() - 0.3) * 1_000_000);
      const out = allocate(amount, ratios);
      expect(out).toHaveLength(n);
      expect(sum(out)).toBe(amount);
      const total = sum(ratios);
      out.forEach((share, i) => {
        expect(Number.isInteger(share)).toBe(true);
        expect(Math.abs(share - (amount * ratios[i]) / total)).toBeLessThan(1);
      });
    }
  });

  it('is exact past 2**53', () => {
    const out = allocate(Number.MAX_SAFE_INTEGER, [1, 2]);
    expect(out).toEqual([3002399751580330, 6004799503160661]);
    expect(BigInt(out[0]) + BigInt(out[1])).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    // A float-based version gives a unit to the wrong share on these.
    expect(allocate(7039312456306808, [409, 928, 647])).toEqual([1451148586002764, 3292581632788668, 2295582237515376]);
    expect(allocate(372485785053738, [160, 756, 510])).toEqual([41793636471667, 197474932328630, 133217216253441]);
  });
});

describe('validation', () => {
  it('rejects bad ratios', () => {
    expect(() => allocate(100, [])).toThrow(RangeError);
    expect(() => allocate(100, [0, 0])).toThrow(RangeError);
    expect(() => allocate(100, [1, -1, 2])).toThrow(RangeError);
    expect(() => allocate(100, [1.5, 1])).toThrow(RangeError);
    expect(() => allocate(100, [1, NaN])).toThrow(RangeError);
  });

  it('rejects a non-integer amount', () => {
    expect(() => allocate(10.5, [1, 1])).toThrow(RangeError);
    expect(() => allocate(2 ** 53, [1, 1])).toThrow(RangeError);
  });
});

describe('splitEvenly', () => {
  it('splits into equal parts, extra units first', () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(10, 4)).toEqual([3, 3, 2, 2]);
    expect(splitEvenly(-10, 4)).toEqual([-3, -3, -2, -2]);
    expect(splitEvenly(5, 1)).toEqual([5]);
  });

  it('rejects a bad number of parts', () => {
    expect(() => splitEvenly(10, 0)).toThrow(RangeError);
    expect(() => splitEvenly(10, 2.5)).toThrow(RangeError);
  });
});

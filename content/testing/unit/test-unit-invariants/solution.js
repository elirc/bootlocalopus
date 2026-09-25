const sum = (xs) => xs.reduce((a, b) => a + b, 0);

const RATIOS = [[1], [1, 1], [1, 1, 1], [1, 2], [3, 0, 7], [0.1, 0.2, 0.7], [5, 3, 2], [1, 1, 1, 1, 1, 1, 1]];
const TOTALS = Array.from({ length: 201 }, (_, i) => i).concat([999, 1001, 123457]);

describe('allocate: invariants over generated inputs', () => {
  it('the shares always add up to exactly the total', () => {
    for (const ratios of RATIOS) {
      for (const total of TOTALS) {
        expect(sum(solution.allocate(total, ratios))).toBe(total);
      }
    }
  });

  it('every share is a whole number less than one cent from its exact value', () => {
    for (const ratios of RATIOS) {
      for (const total of TOTALS) {
        const shares = solution.allocate(total, ratios);
        expect(shares).toHaveLength(ratios.length);
        shares.forEach((share, i) => {
          const exact = (total * ratios[i]) / sum(ratios);
          expect(Number.isInteger(share)).toBe(true);
          expect(Math.abs(share - exact)).toBeLessThan(1);
        });
      }
    }
  });

  it('a zero ratio always gets zero', () => {
    for (const total of TOTALS) {
      expect(solution.allocate(total, [3, 0, 7])[1]).toBe(0);
    }
  });
});

describe('allocate: who gets the spare cents (policy, pinned by example)', () => {
  it('the largest remainder gets the spare cent', () => {
    expect(solution.allocate(100, [1, 2])).toEqual([33, 67]);
    expect(solution.allocate(1001, [50, 30, 20])).toEqual([501, 300, 200]);
  });

  it('on a tie the earlier part wins', () => {
    expect(solution.allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(solution.allocate(5, [1, 1])).toEqual([3, 2]);
  });
});

describe('allocate: rejections', () => {
  for (const [label, total, ratios] of [
    ['a negative total', -10, [1, 1]],
    ['a fractional total', 10.5, [1, 1]],
    ['no ratios', 100, []],
    ['all-zero ratios', 100, [0, 0]],
  ]) {
    it(`throws a RangeError for ${label}`, () => {
      expect(() => solution.allocate(total, ratios)).toThrow(RangeError);
    });
  }
});

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

describe('allocate', () => {
  it('splits 100 by 50/30/20', () => {
    expect(solution.allocate(10000, [50, 30, 20])).toEqual([5000, 3000, 2000]);
  });

  it('splits evenly', () => {
    expect(solution.allocate(90, [1, 1, 1])).toEqual([30, 30, 30]);
  });

  // TODO: invariants over many generated inputs (does it always add up?), the leftover-cent policy, the RangeErrors.
});

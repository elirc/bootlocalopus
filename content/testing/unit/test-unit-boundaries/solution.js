describe('shippingCost: prices on and around every boundary', () => {
  const cases = [
    // [grams, cents]
    [1, 395],
    [500, 395],
    [501, 695],
    [2000, 695],
    [2001, 1295],
    [10000, 1295],
    [10001, 1395],  // just over: one started kilogram
    [10500, 1395],  // mid-kilogram still counts as started
    [11000, 1395],  // exactly one whole kilogram over
    [11001, 1495],  // the second kilogram has started
  ];

  for (const [grams, cents] of cases) {
    it(`${grams} g costs ${cents}`, () => {
      expect(solution.shippingCost(grams)).toBe(cents);
    });
  }
});

describe('shippingCost: rejects weights that are not positive whole grams', () => {
  for (const bad of [0, -5, 1.5, NaN]) {
    it(`throws a RangeError for ${bad}`, () => {
      expect(() => solution.shippingCost(bad)).toThrow(RangeError);
    });
  }
});

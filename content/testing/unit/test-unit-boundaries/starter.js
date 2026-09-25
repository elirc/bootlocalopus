// One test per band, each in the middle of it. Where are the bugs likely to be?

describe('shippingCost', () => {
  it('prices a small parcel', () => {
    expect(solution.shippingCost(250)).toBe(395);
  });

  it('prices a medium parcel', () => {
    expect(solution.shippingCost(1000)).toBe(695);
  });

  it('prices a large parcel', () => {
    expect(solution.shippingCost(5000)).toBe(1295);
  });

  it('rejects a negative weight', () => {
    expect(() => solution.shippingCost(-1)).toThrow(RangeError);
  });

  // TODO: test ON each threshold and one gram past it; the started-kilogram rule; 0 and fractions.
});

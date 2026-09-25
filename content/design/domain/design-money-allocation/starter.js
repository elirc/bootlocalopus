// The version in the checkout today. Split £10.00 three ways and see what
// happens to the last penny.
export function allocate(totalMinor, ratios) {
  const ratioSum = ratios.reduce((a, b) => a + b, 0);
  return ratios.map((r) => Math.round((totalMinor * r) / ratioSum));
}

export function splitEvenly(totalMinor, n) {
  throw new Error('TODO');
}

export function distributeDiscount(lines, discountMinor) {
  throw new Error('TODO');
}

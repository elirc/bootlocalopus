/**
 * Splits `totalCents` across parts in proportion to `ratios`, in whole cents.
 * Each part gets the floor of its exact share; the cents left over go one each
 * to the parts with the largest remainders, earlier parts winning ties.
 */
export function allocate(totalCents, ratios) {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new RangeError('total must be a non-negative whole number of cents');
  }
  if (!Array.isArray(ratios) || ratios.length === 0 || ratios.some((r) => !(r >= 0))) {
    throw new RangeError('ratios must be a non-empty array of non-negative numbers');
  }
  const sum = ratios.reduce((a, b) => a + b, 0);

  const exact = ratios.map((r) => (totalCents * r) / sum);
  const shares = exact.map(Math.floor);
  let leftover = totalCents - shares.reduce((a, b) => a + b, 0);

  // Largest remainder first; on a tie the earlier part wins.
  const order = exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (leftover === 0) break;
    shares[i] += 1;
    leftover -= 1;
  }
  return shares;
}

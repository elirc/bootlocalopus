/**
 * Split `totalMinor` in proportion to `ratios` so the parts sum to exactly
 * `totalMinor` (largest-remainder method). Leftover units go to the parts
 * with the largest fractional share; ties go to the earlier part.
 */
export function allocate(totalMinor, ratios) {
  if (!Number.isSafeInteger(totalMinor)) throw new RangeError('total must be an integer number of minor units');
  if (!Array.isArray(ratios) || ratios.length === 0) throw new RangeError('ratios must be a non-empty array');
  if (ratios.some((r) => !Number.isSafeInteger(r) || r < 0)) throw new RangeError('ratios must be non-negative integers');
  const ratioSum = ratios.reduce((a, b) => a + b, 0);
  if (ratioSum === 0) throw new RangeError('at least one ratio must be positive');

  // Allocate the magnitude, then restore the sign: a refund splits like the charge.
  const sign = totalMinor < 0 ? -1 : 1;
  const total = Math.abs(totalMinor);

  const parts = ratios.map((ratio, index) => {
    const numerator = total * ratio; // integer arithmetic: floor and remainder are exact
    return { index, base: Math.floor(numerator / ratioSum), remainder: numerator % ratioSum };
  });
  let leftover = total - parts.reduce((sum, p) => sum + p.base, 0);

  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const part of byRemainder) {
    if (leftover === 0) break;
    part.base += 1;
    leftover -= 1;
  }

  return parts.map((p) => (p.base === 0 ? 0 : sign * p.base));
}

export function splitEvenly(totalMinor, n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('n must be a positive integer');
  return allocate(totalMinor, Array.from({ length: n }, () => 1));
}

/** Spread an order-level discount over its lines, in proportion to each line's amount. */
export function distributeDiscount(lines, discountMinor) {
  if (!Number.isSafeInteger(discountMinor) || discountMinor < 0) throw new RangeError('discount must be a non-negative integer');
  const subtotal = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  if (discountMinor > subtotal) throw new RangeError('discount exceeds the order subtotal');
  const shares = discountMinor === 0 ? lines.map(() => 0) : allocate(discountMinor, lines.map((l) => l.amountMinor));
  return lines.map((line, i) => ({
    ...line,
    discountMinor: shares[i],
    netMinor: line.amountMinor - shares[i],
  }));
}

export function allocate(amount, ratios) {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`amount must be a safe integer, got ${amount}`);
  if (!Array.isArray(ratios) || ratios.length === 0) throw new RangeError('ratios must be a non-empty array');
  if (!ratios.every((r) => Number.isSafeInteger(r) && r >= 0)) {
    throw new RangeError('every ratio must be a non-negative safe integer');
  }

  // BigInt keeps amount × ratio exact past 2**53.
  const total = ratios.reduce((sum, r) => sum + BigInt(r), 0n);
  if (total === 0n) throw new RangeError('at least one ratio must be positive');

  const sign = amount < 0 ? -1n : 1n;
  const abs = BigInt(amount) * sign;

  const shares = ratios.map((r, index) => {
    const exact = abs * BigInt(r); // the share is exact / total
    return { index, base: exact / total, remainder: exact % total };
  });

  // Units lost to rounding down, handed out one each by largest remainder, earlier index first.
  let leftover = abs - shares.reduce((sum, s) => sum + s.base, 0n);
  const byRemainder = shares.toSorted((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const share of byRemainder) {
    if (leftover === 0n) break;
    share.base += 1n;
    leftover -= 1n;
  }

  return shares.map((s) => Number(s.base * sign));
}

export function splitEvenly(amount, parts) {
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError(`parts must be a positive integer, got ${parts}`);
  return allocate(amount, new Array(parts).fill(1));
}

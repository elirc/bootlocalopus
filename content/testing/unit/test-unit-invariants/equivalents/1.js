// Same rule, written as "pick the best remaining part" one cent at a time.
export function allocate(totalCents, ratios) {
  const validTotal = typeof totalCents === 'number' && Number.isInteger(totalCents) && totalCents >= 0;
  if (!validTotal) throw new RangeError('bad total');
  const validRatios = Array.isArray(ratios) && ratios.length > 0 &&
    ratios.every((r) => typeof r === 'number' && r >= 0);
  if (!validRatios) throw new RangeError('bad ratios');
  let sum = 0;
  for (const r of ratios) sum += r;
  if (!(sum > 0)) throw new RangeError('nothing to split by');

  const parts = ratios.map((r) => {
    const exact = (totalCents * r) / sum;
    const whole = Math.floor(exact);
    return { whole, rem: exact - whole, bumped: false };
  });
  let given = parts.reduce((acc, p) => acc + p.whole, 0);
  while (given < totalCents) {
    let best = -1;
    parts.forEach((p, i) => {
      if (!p.bumped && (best === -1 || p.rem > parts[best].rem)) best = i;
    });
    parts[best].bumped = true;
    parts[best].whole += 1;
    given += 1;
  }
  return parts.map((p) => p.whole);
}

const MODES = new Set(['halfExpand', 'halfEven', 'floor', 'ceil', 'trunc']);
const BPS = 10_000n;

// Divide two BigInts (denominator > 0) and round the quotient by `mode`, exactly.
function divRound(numerator, denominator, mode) {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  let q = abs / denominator; // BigInt division truncates: q is |true value| rounded down
  const r = abs % denominator;

  if (r !== 0n) {
    // Work on the magnitude, then decide whether to step away from zero.
    const twice = 2n * r;
    let awayFromZero;
    switch (mode) {
      case 'trunc': awayFromZero = false; break;
      case 'floor': awayFromZero = negative; break;
      case 'ceil': awayFromZero = !negative; break;
      case 'halfExpand': awayFromZero = twice >= denominator; break;
      case 'halfEven': awayFromZero = twice > denominator || (twice === denominator && q % 2n === 1n); break;
    }
    if (awayFromZero) q += 1n;
  }
  return negative ? -q : q;
}

export function applyRate(amount, rateBps, mode = 'halfEven') {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`amount must be a safe integer, got ${amount}`);
  if (!Number.isSafeInteger(rateBps) || rateBps < 0) {
    throw new RangeError(`rateBps must be a non-negative safe integer, got ${rateBps}`);
  }
  if (!MODES.has(mode)) throw new RangeError(`unknown rounding mode ${mode}`);

  const result = divRound(BigInt(amount) * BigInt(rateBps), BPS, mode);
  const n = Number(result);
  if (!Number.isSafeInteger(n)) throw new RangeError('result is outside the safe integer range');
  return n; // BigInt has no -0, so neither does this
}

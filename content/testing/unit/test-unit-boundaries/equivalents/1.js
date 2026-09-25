// Same prices, written as a lookup table, with a different error message.
const BANDS = [
  { upTo: 500, cents: 395 },
  { upTo: 2000, cents: 695 },
  { upTo: 10000, cents: 1295 },
];

export function shippingCost(weightGrams) {
  const valid = typeof weightGrams === 'number' && Number.isInteger(weightGrams) && weightGrams > 0;
  if (!valid) throw new RangeError('invalid weight');
  const band = BANDS.find((b) => weightGrams <= b.upTo);
  if (band) return band.cents;
  const kilos = Math.ceil(weightGrams / 1000);
  return 1295 + (kilos - 10) * 100;
}

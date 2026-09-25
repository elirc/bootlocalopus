/**
 * Shipping price in cents for a parcel of `weightGrams`.
 *
 *   1 g – 500 g        395
 *   501 g – 2000 g     695
 *   2001 g – 10000 g  1295
 *   over 10000 g      1295 + 100 for every started kilogram over 10 kg
 */
export function shippingCost(weightGrams) {
  if (!Number.isInteger(weightGrams) || weightGrams <= 0) {
    throw new RangeError(`weight must be a positive whole number of grams, got ${weightGrams}`);
  }
  const grams = weightGrams;
  if (grams <= 500) return 395;
  if (grams <= 2000) return 695;
  if (grams <= 10000) return 1295;
  const startedKgOver = Math.floor((grams - 10000) / 1000) + 1;
  return 1295 + startedKgOver * 100;
}

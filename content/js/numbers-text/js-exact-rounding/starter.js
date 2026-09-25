export function applyRate(amount, rateBps, mode = 'halfEven') {
  return Math.round((amount * rateBps) / 10000);
}

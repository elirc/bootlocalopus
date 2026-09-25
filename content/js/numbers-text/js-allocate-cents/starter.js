export function allocate(amount, ratios) {
  const total = ratios.reduce((a, b) => a + b, 0);
  return ratios.map((r) => Math.round((amount * r) / total));
}

export function splitEvenly(amount, parts) {
  return allocate(amount, Array(parts).fill(1));
}

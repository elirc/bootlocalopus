export function createProductPage({
  catalog,
  reviews,
  recommendations,
  timeouts = { reviews: 300, recommendations: 200 },
  staleEntries = 1000,
  timers = { setTimeout, clearTimeout },
}) {
  return {
    async getPage(productId) {
      // All or nothing, and as slow as the slowest. TODO: timeouts,
      // fallbacks to the last good value, and a `degraded` list.
      const signal = new AbortController().signal;
      const [product, r, rec] = await Promise.all([
        catalog(productId, signal),
        reviews(productId, signal),
        recommendations(productId, signal),
      ]);
      return { product, reviews: r, recommendations: rec, degraded: [] };
    },
  };
}

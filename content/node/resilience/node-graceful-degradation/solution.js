export function createProductPage({
  catalog,
  reviews,
  recommendations,
  timeouts = { reviews: 300, recommendations: 200 },
  staleEntries = 1000,
  timers = { setTimeout, clearTimeout },
}) {
  const optional = { reviews, recommendations };
  // name -> Map(productId -> last good value). Map order = storage order, oldest first.
  const lastGood = { reviews: new Map(), recommendations: new Map() };

  const remember = (name, productId, value) => {
    const cache = lastGood[name];
    cache.delete(productId); // re-inserting moves it to the newest position
    cache.set(productId, value);
    if (cache.size > staleEntries) cache.delete(cache.keys().next().value);
  };

  /** Resolves { ok: true, value } or { ok: false } — never rejects. */
  const withTimeout = (name, productId, controller) =>
    new Promise((resolve) => {
      let done = false;
      const settle = (result) => {
        if (done) return;
        done = true;
        timers.clearTimeout(timer);
        resolve(result);
      };
      const timer = timers.setTimeout(() => {
        controller.abort(new Error(`${name} timed out`));
        settle({ ok: false });
      }, timeouts[name]);
      let call;
      try {
        call = Promise.resolve(optional[name](productId, controller.signal));
      } catch (error) {
        call = Promise.reject(error); // a synchronous throw is just another failure
      }
      call.then((value) => settle({ ok: true, value }), () => settle({ ok: false }));
    });

  const degrade = (name, productId, result, degraded) => {
    if (result.ok) {
      remember(name, productId, result.value);
      return result.value;
    }
    const cache = lastGood[name];
    if (cache.has(productId)) {
      degraded.push(`${name}:stale`);
      return cache.get(productId);
    }
    degraded.push(`${name}:empty`);
    return [];
  };

  return {
    async getPage(productId) {
      const controllers = { reviews: new AbortController(), recommendations: new AbortController() };
      const pending = {
        reviews: withTimeout('reviews', productId, controllers.reviews),
        recommendations: withTimeout('recommendations', productId, controllers.recommendations),
      };

      let product;
      try {
        product = await catalog(productId, new AbortController().signal);
      } catch (error) {
        // No product, no page: stop the work whose result nobody will use.
        controllers.reviews.abort(error);
        controllers.recommendations.abort(error);
        throw error;
      }

      const [r, rec] = await Promise.all([pending.reviews, pending.recommendations]);
      const degraded = [];
      return {
        product,
        reviews: degrade('reviews', productId, r, degraded),
        recommendations: degrade('recommendations', productId, rec, degraded),
        degraded,
      };
    },
  };
}

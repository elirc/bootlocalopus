const { planResourceHints } = solution;
const PAGE = 'https://shop.com';

describe('preloads', () => {
  it('preloads the LCP image with high priority, and no other image', () => {
    expect(planResourceHints(PAGE, [
      { url: 'https://shop.com/hero.jpg', type: 'image', critical: true, lcp: true },
      { url: 'https://shop.com/logo.svg', type: 'image', critical: true },
    ])).toEqual([{ rel: 'preload', as: 'image', href: 'https://shop.com/hero.jpg', fetchpriority: 'high' }]);
  });

  it('carries srcset and sizes over, so the right candidate is fetched', () => {
    const [hint] = planResourceHints(PAGE, [{
      url: 'https://shop.com/hero-800.jpg', type: 'image', critical: true, lcp: true,
      srcset: 'https://shop.com/hero-400.jpg 400w, https://shop.com/hero-800.jpg 800w', sizes: '100vw',
    }]);
    expect(hint).toEqual({
      rel: 'preload', as: 'image', href: 'https://shop.com/hero-800.jpg', fetchpriority: 'high',
      imagesrcset: 'https://shop.com/hero-400.jpg 400w, https://shop.com/hero-800.jpg 800w', imagesizes: '100vw',
    });
    expect(Object.keys(hint)).toHaveLength(6);
  });

  it('preloads fonts in CORS mode, with a type when it is known', () => {
    expect(planResourceHints(PAGE, [
      { url: 'https://shop.com/fonts/inter.woff2', type: 'font', critical: true },
      { url: 'https://shop.com/fonts/old.woff?v=2', type: 'font', critical: true },
      { url: 'https://shop.com/fonts/icons.ttf', type: 'font', critical: true },
    ])).toEqual([
      { rel: 'preload', as: 'font', href: 'https://shop.com/fonts/inter.woff2', crossorigin: 'anonymous', type: 'font/woff2' },
      { rel: 'preload', as: 'font', href: 'https://shop.com/fonts/old.woff?v=2', crossorigin: 'anonymous', type: 'font/woff' },
      { rel: 'preload', as: 'font', href: 'https://shop.com/fonts/icons.ttf', crossorigin: 'anonymous' },
    ]);
  });

  it('uses modulepreload for modules, and the right "as" for the rest', () => {
    expect(planResourceHints(PAGE, [
      { url: 'https://shop.com/assets/app.js', type: 'script', critical: true, module: true },
      { url: 'https://shop.com/legacy.js', type: 'script', critical: true },
      { url: 'https://shop.com/above-fold.css', type: 'style', critical: true },
      { url: 'https://shop.com/api/menu', type: 'fetch', critical: true },
    ])).toEqual([
      { rel: 'modulepreload', href: 'https://shop.com/assets/app.js' },
      { rel: 'preload', as: 'script', href: 'https://shop.com/legacy.js' },
      { rel: 'preload', as: 'style', href: 'https://shop.com/above-fold.css' },
      { rel: 'preload', as: 'fetch', href: 'https://shop.com/api/menu', crossorigin: 'anonymous' },
    ]);
  });

  it('ignores non-critical resources and duplicate urls', () => {
    expect(planResourceHints(PAGE, [
      { url: 'https://shop.com/footer.css', type: 'style', critical: false },
      { url: 'https://cdn.other.com/x.js', type: 'script' },
      { url: 'https://shop.com/a.css', type: 'style', critical: true },
      { url: 'https://shop.com/a.css', type: 'style', critical: true },
    ])).toEqual([{ rel: 'preload', as: 'style', href: 'https://shop.com/a.css' }]);
  });
});

describe('connections', () => {
  it('preconnects to other origins first, never to the page\'s own', () => {
    const hints = planResourceHints(PAGE, [
      { url: 'https://shop.com/app.css', type: 'style', critical: true },
      { url: 'https://img.shopcdn.com/hero.jpg', type: 'image', critical: true },
    ]);
    expect(hints).toEqual([{ rel: 'preconnect', href: 'https://img.shopcdn.com' }, { rel: 'preload', as: 'style', href: 'https://shop.com/app.css' }]);
  });

  it('opens a CORS connection for fonts, fetches and modules — separately from the plain one', () => {
    const hints = planResourceHints(PAGE, [
      { url: 'https://fonts.gstatic.com/s/inter.woff2', type: 'font', critical: true },
      { url: 'https://cdn.shop.com/lib.js', type: 'script', critical: true },
      { url: 'https://cdn.shop.com/mod.js', type: 'script', critical: true, module: true },
      { url: 'https://cdn.shop.com/other.js', type: 'script', critical: true },
    ]);
    expect(hints.filter((h) => h.rel === 'preconnect')).toEqual([
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
      { rel: 'preconnect', href: 'https://cdn.shop.com' },
      { rel: 'preconnect', href: 'https://cdn.shop.com', crossorigin: 'anonymous' },
    ]);
    expect(hints.slice(0, 3).every((h) => h.rel === 'preconnect')).toBe(true);
  });

  it('caps preconnects at 4 and falls back to one dns-prefetch per remaining origin', () => {
    const hints = planResourceHints(PAGE, [
      { url: 'https://a.com/1.js', type: 'script', critical: true },
      { url: 'https://b.com/1.woff2', type: 'font', critical: true },
      { url: 'https://c.com/1.css', type: 'style', critical: true },
      { url: 'https://a.com/api', type: 'fetch', critical: true },
      { url: 'https://d.com/1.js', type: 'script', critical: true },
      { url: 'https://d.com/2.woff2', type: 'font', critical: true },
      { url: 'https://b.com/2.js', type: 'script', critical: true },
      { url: 'https://e.com/x.png', type: 'image', critical: true },
      { url: 'https://f.com/y.png', type: 'image', critical: false },
    ]);
    const connections = hints.filter((h) => h.rel === 'preconnect' || h.rel === 'dns-prefetch');
    expect(connections).toEqual([
      { rel: 'preconnect', href: 'https://a.com' },
      { rel: 'preconnect', href: 'https://b.com', crossorigin: 'anonymous' },
      { rel: 'preconnect', href: 'https://c.com' },
      { rel: 'preconnect', href: 'https://a.com', crossorigin: 'anonymous' },
      { rel: 'dns-prefetch', href: 'https://d.com' },
      { rel: 'dns-prefetch', href: 'https://e.com' },
    ]);
    expect(hints.slice(0, 6)).toEqual(connections);
  });

  it('returns nothing for nothing', () => {
    expect(planResourceHints(PAGE, [])).toEqual([]);
  });
});

const { diagnoseLcp } = solution;

const HERO = 'https://shop.com/img/hero.avif';
const res = (name, initiatorType, startTime, responseEnd, renderBlockingStatus = 'non-blocking') =>
  ({ name, initiatorType, startTime, responseEnd, renderBlockingStatus });

describe('phases', () => {
  it('breaks a healthy image LCP into its four phases', () => {
    const result = diagnoseLcp({
      navigation: { responseStart: 300.4 },
      lcp: { startTime: 1350.6, url: HERO, loading: 'eager' },
      resources: [res('https://shop.com/app.css', 'link', 310, 500, 'blocking'), res(HERO, 'img', 450, 1200)],
    });
    expect(result).toEqual({
      kind: 'image',
      value: 1351,
      rating: 'good',
      phases: { ttfb: 300, loadDelay: 150, loadDuration: 750, renderDelay: 151 },
      issues: [],
      blockers: [],
    });
  });

  it('treats a text LCP as all render delay', () => {
    const result = diagnoseLcp({
      navigation: { responseStart: 500 },
      lcp: { startTime: 1600, url: '' },
      resources: [res('https://shop.com/app.css', 'link', 510, 700, 'blocking')],
    });
    expect(result.kind).toBe('text');
    expect(result.phases).toEqual({ ttfb: 500, loadDelay: 0, loadDuration: 0, renderDelay: 1100 });
  });

  it('treats an image with no resource entry as text', () => {
    const result = diagnoseLcp({
      navigation: { responseStart: 200 },
      lcp: { startTime: 900, url: 'data:image/png;base64,AAAA' },
      resources: [res(HERO, 'img', 250, 800)],
    });
    expect(result.kind).toBe('text');
    expect(result.phases).toEqual({ ttfb: 200, loadDelay: 0, loadDuration: 0, renderDelay: 700 });
  });

  it('uses the earliest request for the image, and never a negative phase', () => {
    const result = diagnoseLcp({
      navigation: { responseStart: 300 },
      lcp: { startTime: 1000, url: HERO },
      resources: [res(HERO, 'img', 600, 1100), res(HERO, 'link', 100, 700)],
    });
    expect(result.phases).toEqual({ ttfb: 300, loadDelay: 0, loadDuration: 600, renderDelay: 300 });
    expect(result.issues).toEqual([]);
  });
});

describe('issues', () => {
  it('diagnoses a late, heavy CSS background image behind a slow server', () => {
    const result = diagnoseLcp({
      navigation: { responseStart: 900 },
      lcp: { startTime: 3300, url: HERO },
      resources: [
        res('https://shop.com/app.css', 'link', 910, 1800, 'blocking'),
        res(HERO, 'css', 1850, 3200),
      ],
    });
    expect(result.phases).toEqual({ ttfb: 900, loadDelay: 950, loadDuration: 1350, renderDelay: 100 });
    expect(result.rating).toBe('needs-improvement');
    expect(result.issues).toEqual(['slow-server', 'not-in-html', 'late-discovery', 'slow-download']);
    expect(result.blockers).toEqual([]);
  });

  it('flags a lazy-loaded LCP image and one inserted by a script', () => {
    const result = diagnoseLcp({
      navigation: { responseStart: 200 },
      lcp: { startTime: 2000, url: HERO, loading: 'lazy' },
      resources: [res(HERO, 'script', 900, 1800)],
    });
    expect(result.issues).toEqual(['lazy-lcp', 'not-in-html', 'late-discovery']);
  });

  it('names the render-blocking resources that were still loading', () => {
    const result = diagnoseLcp({
      navigation: { responseStart: 200 },
      lcp: { startTime: 2700, url: HERO },
      resources: [
        res('https://shop.com/early.css', 'link', 210, 800, 'blocking'),
        res(HERO, 'link', 250, 900),
        res('https://shop.com/app.css', 'link', 220, 2600, 'blocking'),
        res('https://shop.com/analytics.js', 'script', 230, 3000, 'non-blocking'),
        res('https://cdn.fonts.com/fonts.css', 'link', 230, 2600, 'blocking'),
        res('https://shop.com/vendor.js', 'script', 240, 2400, 'blocking'),
      ],
    });
    expect(result.phases.renderDelay).toBe(1800);
    expect(result.issues).toEqual(['render-blocked']);
    expect(result.blockers).toEqual(['https://cdn.fonts.com/fonts.css', 'https://shop.com/app.css', 'https://shop.com/vendor.js']);
  });

  it('blames the main thread when nothing was blocking', () => {
    const result = diagnoseLcp({
      navigation: { responseStart: 300 },
      lcp: { startTime: 2400, url: '' },
      resources: [res('https://shop.com/app.css', 'link', 100, 290, 'blocking'), res('https://shop.com/app.js', 'script', 320, 2000)],
    });
    expect(result.issues).toEqual(['slow-render']);
    expect(result.blockers).toEqual([]);
  });

  it('finds blockers for a text LCP relative to TTFB', () => {
    const result = diagnoseLcp({
      navigation: { responseStart: 500 },
      lcp: { startTime: 1600, url: '' },
      resources: [res('https://shop.com/font.css', 'link', 510, 1400, 'blocking'), res('https://shop.com/tiny.css', 'link', 100, 450, 'blocking')],
    });
    expect(result.issues).toEqual(['render-blocked']);
    expect(result.blockers).toEqual(['https://shop.com/font.css']);
  });
});

describe('thresholds', () => {
  it('uses strict limits on the raw numbers', () => {
    const atLimits = diagnoseLcp({
      navigation: { responseStart: 800 },
      lcp: { startTime: 3300, url: HERO },
      resources: [res(HERO, 'img', 1300, 2300), res('https://shop.com/late.css', 'link', 900, 3000, 'blocking')],
    });
    expect(atLimits.phases).toEqual({ ttfb: 800, loadDelay: 500, loadDuration: 1000, renderDelay: 1000 });
    expect(atLimits.issues).toEqual(['render-blocked']);

    const justOver = diagnoseLcp({
      navigation: { responseStart: 800.4 },
      lcp: { startTime: 2801.3, url: HERO },
      resources: [res(HERO, 'img', 1300.6, 2300.9)],
    });
    // Every phase rounds to the limit, but the raw values are over it.
    expect(justOver.phases).toEqual({ ttfb: 800, loadDelay: 500, loadDuration: 1000, renderDelay: 500 });
    expect(justOver.issues).toEqual(['slow-server', 'late-discovery', 'slow-download', 'slow-render']);
  });

  it('rates with inclusive bounds on the rounded value', () => {
    const rate = (startTime) => diagnoseLcp({ navigation: { responseStart: 100 }, lcp: { startTime, url: '' }, resources: [] }).rating;
    expect(rate(2500)).toBe('good');
    expect(rate(2500.4)).toBe('good');
    expect(rate(2501)).toBe('needs-improvement');
    expect(rate(4000)).toBe('needs-improvement');
    expect(rate(4000.6)).toBe('poor');
  });
});

const { imageAttributes } = solution;

const HERO = {
  src: 'https://img.shop.com/p/42.jpg',
  widths: [1600, 400, 800, 400, 1200],
  intrinsic: { width: 1500, height: 1000 },
  alt: 'Blue mug on a desk',
};

describe('candidates', () => {
  it('builds an ascending, deduplicated srcset without upscaling', () => {
    const attrs = imageAttributes(HERO);
    expect(attrs.srcset).toBe(
      'https://img.shop.com/p/42.jpg?w=400 400w, https://img.shop.com/p/42.jpg?w=800 800w, https://img.shop.com/p/42.jpg?w=1200 1200w',
    );
  });

  it('keeps existing query parameters and replaces an existing w', () => {
    const attrs = imageAttributes({ ...HERO, src: 'https://img.shop.com/p/42.jpg?fm=webp&w=9999&q=70', widths: [400] });
    const url = new URL(attrs.srcset.split(' ')[0]);
    expect(url.searchParams.get('fm')).toBe('webp');
    expect(url.searchParams.get('q')).toBe('70');
    expect(url.searchParams.getAll('w')).toEqual(['400']);
    expect(attrs.srcset.endsWith(' 400w')).toBe(true);
  });

  it('falls back to the intrinsic width when every candidate is too big', () => {
    const attrs = imageAttributes({ ...HERO, intrinsic: { width: 300, height: 300 }, widths: [400, 800] });
    expect(attrs.srcset).toBe('https://img.shop.com/p/42.jpg?w=300 300w');
    expect(attrs.src).toBe('https://img.shop.com/p/42.jpg?w=300');
  });

  it('keeps a candidate equal to the intrinsic width', () => {
    const attrs = imageAttributes({ ...HERO, widths: [1500, 3000] });
    expect(attrs.srcset).toBe('https://img.shop.com/p/42.jpg?w=1500 1500w');
  });

  it('picks the smallest candidate of at least 800 as src, else the largest', () => {
    expect(imageAttributes(HERO).src).toBe('https://img.shop.com/p/42.jpg?w=800');
    expect(imageAttributes({ ...HERO, widths: [200, 400, 600] }).src).toBe('https://img.shop.com/p/42.jpg?w=600');
    expect(imageAttributes({ ...HERO, widths: [900, 1200] }).src).toBe('https://img.shop.com/p/42.jpg?w=900');
  });

  it('rejects widths that are not positive integers', () => {
    for (const bad of [0, -100, 400.5, '800', NaN]) {
      expect(() => imageAttributes({ ...HERO, widths: [400, bad] })).toThrow(TypeError);
    }
  });
});

describe('sizes', () => {
  it('orders slots from the widest viewport down, then the fallback', () => {
    const attrs = imageAttributes({
      ...HERO,
      slots: [{ minViewport: 640, width: '50vw' }, { minViewport: 1280, width: 400 }, { minViewport: 1024, width: '33vw' }],
      fallbackWidth: 'calc(100vw - 32px)',
    });
    expect(attrs.sizes).toBe('(min-width: 1280px) 400px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, calc(100vw - 32px)');
  });

  it('defaults to 100vw, and writes a numeric fallback in px', () => {
    expect(imageAttributes(HERO).sizes).toBe('100vw');
    expect(imageAttributes({ ...HERO, fallbackWidth: 320 }).sizes).toBe('320px');
  });

  it('does not reorder the caller\'s array', () => {
    const slots = [{ minViewport: 640, width: '50vw' }, { minViewport: 1024, width: '33vw' }];
    imageAttributes({ ...HERO, slots });
    expect(slots.map((s) => s.minViewport)).toEqual([640, 1024]);
  });
});

describe('the rest of the tag', () => {
  it('reserves space and lazy-loads an ordinary image', () => {
    const attrs = imageAttributes(HERO);
    expect(attrs).toEqual({
      src: 'https://img.shop.com/p/42.jpg?w=800',
      srcset: attrs.srcset,
      sizes: '100vw',
      width: 1500,
      height: 1000,
      alt: 'Blue mug on a desk',
      loading: 'lazy',
      decoding: 'async',
    });
    expect(Object.keys(attrs).sort()).toEqual(['alt', 'decoding', 'height', 'loading', 'sizes', 'src', 'srcset', 'width']);
  });

  it('loads the LCP image eagerly with high priority', () => {
    const attrs = imageAttributes({ ...HERO, priority: true });
    expect(attrs.loading).toBe('eager');
    expect(attrs.fetchpriority).toBe('high');
    expect(attrs.decoding).toBeUndefined();
  });

  it('requires alt, but accepts an empty one', () => {
    expect(() => imageAttributes({ ...HERO, alt: undefined })).toThrow(TypeError);
    expect(imageAttributes({ ...HERO, alt: '' }).alt).toBe('');
  });
});

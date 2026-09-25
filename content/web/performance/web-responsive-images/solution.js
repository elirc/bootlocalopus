const css = (width) => (typeof width === 'number' ? `${width}px` : width);

function candidateUrl(src, width) {
  const url = new URL(src);
  url.searchParams.set('w', String(width)); // keep the CDN's other parameters
  return url.href;
}

export function imageAttributes({ src, widths, intrinsic, slots = [], fallbackWidth = '100vw', alt, priority = false }) {
  if (typeof alt !== 'string') throw new TypeError('alt is required (use "" for a decorative image)');
  for (const w of widths) {
    if (!Number.isInteger(w) || w <= 0) throw new TypeError(`Invalid width: ${w}`);
  }

  // Never offer a candidate larger than the original: it is upscaled, not sharper.
  let usable = [...new Set(widths)].filter((w) => w <= intrinsic.width).sort((a, b) => a - b);
  if (usable.length === 0) usable = [intrinsic.width];

  const fallback = usable.find((w) => w >= 800) ?? usable[usable.length - 1];

  // The browser takes the FIRST matching condition, so the widest viewport goes first.
  const sizes = [...slots]
    .sort((a, b) => b.minViewport - a.minViewport)
    .map((slot) => `(min-width: ${slot.minViewport}px) ${css(slot.width)}`)
    .concat(css(fallbackWidth))
    .join(', ');

  return {
    src: candidateUrl(src, fallback),
    srcset: usable.map((w) => `${candidateUrl(src, w)} ${w}w`).join(', '),
    sizes,
    width: intrinsic.width,
    height: intrinsic.height, // both, so the box is reserved before the image loads
    alt,
    ...(priority
      ? { loading: 'eager', fetchpriority: 'high' } // never lazy-load the LCP image
      : { loading: 'lazy', decoding: 'async' }),
  };
}

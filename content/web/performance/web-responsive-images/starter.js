// A first attempt: one big image, lazy-loaded, no dimensions.
export function imageAttributes({ src, widths, intrinsic, slots = [], fallbackWidth = '100vw', alt, priority = false }) {
  return {
    src,
    srcset: widths.map((w) => `${src}?w=${w} ${w}w`).join(', '),
    sizes: slots.map((s) => `(min-width: ${s.minViewport}px) ${s.width}`).join(', '),
    alt,
    loading: 'lazy',
  };
}

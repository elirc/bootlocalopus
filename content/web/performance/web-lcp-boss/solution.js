const THRESHOLDS = { ttfb: 800, loadDelay: 500, loadDuration: 1000, renderDelay: 500 };
const UNDISCOVERABLE = new Set(['css', 'script']);

function rate(ms) {
  if (ms <= 2500) return 'good';
  if (ms <= 4000) return 'needs-improvement';
  return 'poor';
}

/** The earliest request for the LCP image, or null for a text LCP. */
function findImage(lcp, resources) {
  if (!lcp.url) return null;
  let found = null;
  for (const resource of resources) {
    if (resource.name !== lcp.url) continue;
    if (found === null || resource.startTime < found.startTime) found = resource;
  }
  return found;
}

export function diagnoseLcp({ navigation, lcp, resources }) {
  const image = findImage(lcp, resources);
  const ttfb = navigation.responseStart;

  // Raw phases; rounding happens only in the output.
  const loadDelay = image ? Math.max(0, image.startTime - ttfb) : 0;
  const loadDuration = image ? Math.max(0, image.responseEnd - image.startTime) : 0;
  const readyAt = image ? image.responseEnd : ttfb; // earliest moment it could paint
  const renderDelay = Math.max(0, lcp.startTime - readyAt);

  const issues = [];
  let blockers = [];
  if (ttfb > THRESHOLDS.ttfb) issues.push('slow-server');
  if (image) {
    if (lcp.loading === 'lazy') issues.push('lazy-lcp');
    if (UNDISCOVERABLE.has(image.initiatorType)) issues.push('not-in-html');
    if (loadDelay > THRESHOLDS.loadDelay) issues.push('late-discovery');
    if (loadDuration > THRESHOLDS.loadDuration) issues.push('slow-download');
  }
  if (renderDelay > THRESHOLDS.renderDelay) {
    const blocking = resources
      .filter((r) => r.renderBlockingStatus === 'blocking' && r.responseEnd > readyAt)
      .sort((a, b) => b.responseEnd - a.responseEnd || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (blocking.length > 0) {
      issues.push('render-blocked');
      blockers = blocking.map((r) => r.name);
    } else {
      issues.push('slow-render'); // nothing was loading: the main thread was busy
    }
  }

  const value = Math.round(lcp.startTime);
  return {
    kind: image ? 'image' : 'text',
    value,
    rating: rate(value),
    phases: {
      ttfb: Math.round(ttfb),
      loadDelay: Math.round(loadDelay),
      loadDuration: Math.round(loadDuration),
      renderDelay: Math.round(renderDelay),
    },
    issues,
    blockers,
  };
}

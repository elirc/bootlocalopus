// A first attempt: reports the number and blames the server.
export function diagnoseLcp({ navigation, lcp, resources }) {
  return {
    kind: lcp.url ? 'image' : 'text',
    value: lcp.startTime,
    rating: lcp.startTime < 2500 ? 'good' : 'poor',
    phases: { ttfb: navigation.responseStart, loadDelay: 0, loadDuration: 0, renderDelay: 0 },
    issues: ['slow-server'],
    blockers: [],
  };
}

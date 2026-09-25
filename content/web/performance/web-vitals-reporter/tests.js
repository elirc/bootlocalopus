const { createVitalsReporter } = solution;

function setup({ beaconAccepts = true, sampleRate, random } = {}) {
  const sent = [];
  const transport = {
    beacon: (url, body) => { sent.push({ via: 'beacon', url, body: JSON.parse(body), raw: body }); return beaconAccepts; },
    fetch: (url, init) => { sent.push({ via: 'fetch', url, init, body: JSON.parse(init.body) }); return Promise.resolve(new Response(null, { status: 204 })); },
  };
  const reporter = createVitalsReporter({
    endpoint: '/rum', sessionId: 's-1', transport,
    ...(sampleRate === undefined ? {} : { sampleRate }),
    ...(random === undefined ? {} : { random }),
  });
  return { reporter, sent };
}

const fakeDocument = () => {
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  doc.hide = () => { doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange')); };
  doc.show = () => { doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); };
  return doc;
};

describe('batching', () => {
  it('sends nothing until flush, then one beacon with every metric', () => {
    const { reporter, sent } = setup();
    reporter.record({ name: 'LCP', value: 2140.37, id: 'v1-lcp', rating: 'good' });
    reporter.record({ name: 'CLS', value: 0.123456, id: 'v1-cls', rating: 'needs-improvement' });
    expect(sent).toEqual([]);
    reporter.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].via).toBe('beacon');
    expect(sent[0].url).toBe('/rum');
    expect(sent[0].body).toEqual({
      sessionId: 's-1',
      metrics: [
        { name: 'LCP', value: 2140, id: 'v1-lcp', rating: 'good' },
        { name: 'CLS', value: 0.1235, id: 'v1-cls', rating: 'needs-improvement' },
      ],
    });
  });

  it('keeps only the latest value per id, in first-recorded order', () => {
    const { reporter, sent } = setup();
    reporter.record({ name: 'CLS', value: 0.01, id: 'cls', rating: 'good' });
    reporter.record({ name: 'INP', value: 80, id: 'inp', rating: 'good' });
    reporter.record({ name: 'CLS', value: 0.3, id: 'cls', rating: 'poor' });
    reporter.flush();
    expect(sent[0].body.metrics).toEqual([
      { name: 'CLS', value: 0.3, id: 'cls', rating: 'poor' },
      { name: 'INP', value: 80, id: 'inp', rating: 'good' },
    ]);
  });

  it('sends nothing when nothing is pending', () => {
    const { reporter, sent } = setup();
    reporter.flush();
    reporter.record({ name: 'TTFB', value: 312.6, id: 't', rating: 'good' });
    reporter.flush();
    reporter.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].body.metrics).toEqual([{ name: 'TTFB', value: 313, id: 't', rating: 'good' }]);
  });

  it('resends only what changed since the last flush', () => {
    const { reporter, sent } = setup();
    reporter.record({ name: 'LCP', value: 1800, id: 'lcp', rating: 'good' });
    reporter.record({ name: 'CLS', value: 0.05, id: 'cls', rating: 'good' });
    reporter.flush();
    reporter.record({ name: 'LCP', value: 1800.2, id: 'lcp', rating: 'good' }); // same once rounded
    reporter.flush();
    expect(sent).toHaveLength(1);
    reporter.record({ name: 'CLS', value: 0.15, id: 'cls', rating: 'needs-improvement' });
    reporter.flush();
    expect(sent).toHaveLength(2);
    expect(sent[1].body.metrics).toEqual([{ name: 'CLS', value: 0.15, id: 'cls', rating: 'needs-improvement' }]);
  });
});

describe('transport', () => {
  it('falls back to a keepalive fetch when the beacon is refused', () => {
    const { reporter, sent } = setup({ beaconAccepts: false });
    reporter.record({ name: 'INP', value: 240, id: 'inp', rating: 'needs-improvement' });
    reporter.flush();
    expect(sent.map((s) => s.via)).toEqual(['beacon', 'fetch']);
    const { init } = sent[1];
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(init.body).toBe(sent[0].raw);
    reporter.flush();
    expect(sent).toHaveLength(2);
  });
});

describe('sampling', () => {
  it('decides once, when created', () => {
    let calls = 0;
    const { reporter, sent } = setup({ sampleRate: 0.5, random: () => { calls++; return 0.49; } });
    reporter.record({ name: 'LCP', value: 1, id: 'a', rating: 'good' });
    reporter.record({ name: 'CLS', value: 0, id: 'b', rating: 'good' });
    reporter.flush();
    expect(calls).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it('does nothing at all for a page view that is not sampled', () => {
    const { reporter, sent } = setup({ sampleRate: 0.5, random: () => 0.5 });
    reporter.record({ name: 'LCP', value: 1, id: 'a', rating: 'good' });
    reporter.flush();
    expect(sent).toEqual([]);
  });

  it('samples everything by default', () => {
    const { reporter, sent } = setup({ random: () => 0.999999 });
    reporter.record({ name: 'LCP', value: 1, id: 'a', rating: 'good' });
    reporter.flush();
    expect(sent).toHaveLength(1);
  });
});

describe('attach', () => {
  it('flushes when the page is hidden, not when it becomes visible', () => {
    const { reporter, sent } = setup();
    const doc = fakeDocument();
    reporter.attach(doc);
    reporter.record({ name: 'LCP', value: 1500, id: 'lcp', rating: 'good' });
    doc.show();
    expect(sent).toEqual([]);
    doc.hide();
    expect(sent).toHaveLength(1);
    reporter.record({ name: 'CLS', value: 0.2, id: 'cls', rating: 'needs-improvement' });
    doc.show();
    doc.hide();
    expect(sent).toHaveLength(2);
  });

  it('flushes on pagehide, and does not send the same batch twice', () => {
    const { reporter, sent } = setup();
    const doc = fakeDocument();
    reporter.attach(doc);
    reporter.record({ name: 'LCP', value: 1500, id: 'lcp', rating: 'good' });
    doc.dispatchEvent(new Event('pagehide'));
    doc.hide();
    expect(sent).toHaveLength(1);
  });

  it('returns a function that removes both listeners', () => {
    const { reporter, sent } = setup();
    const doc = fakeDocument();
    const detach = reporter.attach(doc);
    detach();
    reporter.record({ name: 'LCP', value: 1500, id: 'lcp', rating: 'good' });
    doc.hide();
    doc.dispatchEvent(new Event('pagehide'));
    expect(sent).toEqual([]);
  });
});

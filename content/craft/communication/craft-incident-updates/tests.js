const { composeUpdate } = solution;

const at = (iso) => Date.parse(iso);

function anIncident(overrides = {}) {
  return {
    title: 'Card payments failing',
    severity: 1,
    status: 'investigating',
    impact: 'About 20% of card payments at checkout fail. PayPal is unaffected.',
    workaround: 'Customers can pay with PayPal.',
    startedAt: '2024-05-01T14:05:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

describe('composeUpdate: an open incident', () => {
  it('matches the example from the brief', () => {
    expect(composeUpdate(anIncident(), at('2024-05-01T14:52:00.000Z'))).toEqual({
      text: [
        '[SEV1] Investigating: Card payments failing',
        'Impact: About 20% of card payments at checkout fail. PayPal is unaffected.',
        'Started: 14:05 UTC (47 min ago)',
        'Workaround: Customers can pay with PayPal.',
        'Next update: by 15:25 UTC',
      ].join('\n'),
      nextUpdateAt: '2024-05-01T15:25:00.000Z',
    });
  });

  it('capitalises each status and leaves the workaround out when there is none', () => {
    const { text } = composeUpdate(anIncident({ status: 'monitoring', workaround: null, severity: 2 }), at('2024-05-01T14:30:00.000Z'));
    expect(text.split('\n')).toEqual([
      '[SEV2] Monitoring: Card payments failing',
      'Impact: About 20% of card payments at checkout fail. PayPal is unaffected.',
      'Started: 14:05 UTC (25 min ago)',
      'Next update: by 15:30 UTC',
    ]);
    expect(composeUpdate(anIncident({ status: 'identified' }), at('2024-05-01T14:30:00.000Z')).text.split('\n')[0]).toBe('[SEV1] Identified: Card payments failing');
  });
});

describe('composeUpdate: next update', () => {
  it('uses 30, 60 and 120 minutes for SEV1, SEV2 and SEV3', () => {
    const now = at('2024-05-01T14:40:00.000Z');
    expect(composeUpdate(anIncident({ severity: 1 }), now).nextUpdateAt).toBe('2024-05-01T15:10:00.000Z');
    expect(composeUpdate(anIncident({ severity: 2 }), now).nextUpdateAt).toBe('2024-05-01T15:40:00.000Z');
    expect(composeUpdate(anIncident({ severity: 3 }), now).nextUpdateAt).toBe('2024-05-01T16:40:00.000Z');
  });

  it('rounds up to the next 5 minutes, even by a single second', () => {
    expect(composeUpdate(anIncident(), at('2024-05-01T14:40:01.000Z')).nextUpdateAt).toBe('2024-05-01T15:15:00.000Z');
    expect(composeUpdate(anIncident(), at('2024-05-01T14:44:59.999Z')).nextUpdateAt).toBe('2024-05-01T15:15:00.000Z');
    expect(composeUpdate(anIncident(), at('2024-05-01T14:41:00.000Z')).text.split('\n').at(-1)).toBe('Next update: by 15:15 UTC');
  });

  it('shows the date when the next update is on another day', () => {
    const { text, nextUpdateAt } = composeUpdate(anIncident({ severity: 3, startedAt: '2024-05-01T22:10:00.000Z' }), at('2024-05-01T22:50:00.000Z'));
    expect(nextUpdateAt).toBe('2024-05-02T00:50:00.000Z');
    expect(text.split('\n').at(-1)).toBe('Next update: by 2024-05-02 00:50 UTC');
  });
});

describe('composeUpdate: times and durations', () => {
  it('formats durations in whole minutes, rounding down, with hours from 60 minutes', () => {
    const line = (now) => composeUpdate(anIncident(), at(now)).text.split('\n')[2];
    expect(line('2024-05-01T14:05:59.999Z')).toBe('Started: 14:05 UTC (0 min ago)');
    expect(line('2024-05-01T15:04:59.000Z')).toBe('Started: 14:05 UTC (59 min ago)');
    expect(line('2024-05-01T15:05:00.000Z')).toBe('Started: 14:05 UTC (1 h ago)');
    expect(line('2024-05-01T15:17:30.000Z')).toBe('Started: 14:05 UTC (1 h 12 min ago)');
    expect(line('2024-05-01T17:05:00.000Z')).toBe('Started: 14:05 UTC (3 h ago)');
  });

  it('zero-pads hours and minutes', () => {
    const { text } = composeUpdate(anIncident({ startedAt: '2024-05-01T03:07:00.000Z' }), at('2024-05-01T03:09:00.000Z'));
    expect(text.split('\n')[2]).toBe('Started: 03:07 UTC (2 min ago)');
    expect(text.split('\n').at(-1)).toBe('Next update: by 03:40 UTC');
  });

  it('shows the date when the start was on a different UTC day', () => {
    const { text } = composeUpdate(anIncident({ startedAt: '2024-04-30T23:50:00.000Z' }), at('2024-05-01T00:30:00.000Z'));
    expect(text.split('\n')[2]).toBe('Started: 2024-04-30 23:50 UTC (40 min ago)');
  });
});

describe('composeUpdate: resolved', () => {
  it('says when it started and ended and how long it lasted, with no next update', () => {
    const incident = anIncident({ status: 'resolved', resolvedAt: '2024-05-01T16:10:00.000Z' });
    expect(composeUpdate(incident, at('2024-05-01T16:15:00.000Z'))).toEqual({
      text: [
        '[SEV1] Resolved: Card payments failing',
        'Impact: About 20% of card payments at checkout fail. PayPal is unaffected.',
        'Started: 14:05 UTC, resolved 16:10 UTC (lasted 2 h 5 min)',
      ].join('\n'),
      nextUpdateAt: null,
    });
  });

  it('measures the duration to resolvedAt, not to now, and dates times from other days', () => {
    const incident = anIncident({ status: 'resolved', startedAt: '2024-04-30T23:30:00.000Z', resolvedAt: '2024-05-01T00:15:00.000Z' });
    expect(composeUpdate(incident, at('2024-05-01T09:00:00.000Z')).text.split('\n')[2]).toBe('Started: 2024-04-30 23:30 UTC, resolved 00:15 UTC (lasted 45 min)');
  });
});

describe('composeUpdate: impact is required', () => {
  it('throws when impact is missing or blank', () => {
    const now = at('2024-05-01T14:52:00.000Z');
    expect(() => composeUpdate(anIncident({ impact: '' }), now)).toThrow('impact is required');
    expect(() => composeUpdate(anIncident({ impact: '   ' }), now)).toThrow('impact is required');
    expect(() => composeUpdate(anIncident({ impact: undefined }), now)).toThrow('impact is required');
  });
});

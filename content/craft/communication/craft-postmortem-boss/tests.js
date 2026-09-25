const { buildPostmortem } = solution;

const ev = (hhmm, kind, text, day = '2024-05-01') => ({ at: `${day}T${hhmm}:00.000Z`, kind, text });
const act = (type, text, owner = 'kim', due = '2024-05-10') => ({ type, text, owner, due });

function anIncident(overrides = {}) {
  return {
    title: 'Checkout outage after pricing deploy',
    severity: 1,
    summary: 'A deploy added a call to the pricing service with no timeout. When it slowed down, checkout requests piled up.',
    events: [
      ev('14:05', 'start', 'Deploy 4711 reaches 100%'),
      ev('14:10', 'note', 'First customer ticket'),
      ev('14:17', 'detected', 'Alert: checkout errors above 5%'),
      ev('14:36', 'mitigated', 'Deploy 4711 rolled back'),
      ev('15:10', 'resolved', 'Error rate back to baseline for 30 minutes'),
    ],
    actions: [
      act('prevent', 'Add a 2 s timeout to the pricing client'),
      act('detect', 'Page on checkout error rate above 2% for 3 minutes', 'lee', '2024-05-15'),
    ],
    ...overrides,
  };
}

const rules = (problems) => problems.map((p) => (p.detail === null ? p.rule : `${p.rule}: ${p.detail}`));
const section = (markdown, heading) => {
  const start = markdown.indexOf(`## ${heading}`);
  const end = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, end === -1 ? undefined : end).trimEnd();
};

describe('buildPostmortem: a clean incident', () => {
  it('renders the whole document', () => {
    const { markdown } = buildPostmortem(anIncident());
    expect(markdown).toBe([
      '# Postmortem: Checkout outage after pricing deploy (SEV1)',
      '',
      '## Summary',
      '',
      'A deploy added a call to the pricing service with no timeout. When it slowed down, checkout requests piled up.',
      '',
      '## Impact',
      '',
      '- Time to detect: 12 min',
      '- Time to mitigate: 31 min',
      '- Time to resolve: 1 h 5 min',
      '',
      '## Timeline (UTC)',
      '',
      '- 14:05 (+0 min) Deploy 4711 reaches 100%',
      '- 14:10 (+5 min) First customer ticket',
      '- 14:17 (+12 min) Alert: checkout errors above 5%',
      '- 14:36 (+31 min) Deploy 4711 rolled back',
      '- 15:10 (+1 h 5 min) Error rate back to baseline for 30 minutes',
      '',
      '## Action items',
      '',
      '| Type | Action | Owner | Due |',
      '| --- | --- | --- | --- |',
      '| prevent | Add a 2 s timeout to the pricing client | @kim | 2024-05-10 |',
      '| detect | Page on checkout error rate above 2% for 3 minutes | @lee | 2024-05-15 |',
      '',
    ].join('\n'));
  });

  it('computes the metrics and finds no problems', () => {
    const { metrics, problems } = buildPostmortem(anIncident());
    expect(metrics).toEqual({ timeToDetectMin: 12, timeToMitigateMin: 31, timeToResolveMin: 65 });
    expect(problems).toEqual([]);
  });
});

describe('buildPostmortem: the timeline', () => {
  it('sorts by time and measures from the first event of each kind in time, not in input order', () => {
    const events = [
      ev('14:36', 'mitigated', 'Rolled back'),
      ev('15:10', 'resolved', 'Resolved'),
      ev('14:40', 'detected', 'Second alert'),
      ev('14:05', 'start', 'Deploy'),
      ev('14:17', 'detected', 'First alert'),
    ];
    const { markdown, metrics } = buildPostmortem(anIncident({ events }));
    expect(metrics).toEqual({ timeToDetectMin: 12, timeToMitigateMin: 31, timeToResolveMin: 65 });
    expect(section(markdown, 'Timeline').split('\n').slice(2)).toEqual([
      '- 14:05 (+0 min) Deploy',
      '- 14:17 (+12 min) First alert',
      '- 14:36 (+31 min) Rolled back',
      '- 14:40 (+35 min) Second alert',
      '- 15:10 (+1 h 5 min) Resolved',
    ]);
  });

  it('drops exact duplicates but keeps different events at the same time, in input order', () => {
    const events = [
      ev('14:05', 'start', 'Deploy'),
      ev('14:17', 'detected', 'Alert fired'),
      ev('14:17', 'note', 'Kim acknowledges the page'),
      ev('14:17', 'detected', 'Alert fired'),
      ev('14:17', 'note', 'Alert fired'),
      ev('14:36', 'mitigated', 'Rolled back'),
      ev('15:05', 'resolved', 'Resolved'),
    ];
    const lines = section(buildPostmortem(anIncident({ events })).markdown, 'Timeline').split('\n').slice(2);
    expect(lines).toEqual([
      '- 14:05 (+0 min) Deploy',
      '- 14:17 (+12 min) Alert fired',
      '- 14:17 (+12 min) Kim acknowledges the page',
      '- 14:17 (+12 min) Alert fired',
      '- 14:36 (+31 min) Rolled back',
      '- 15:05 (+1 h) Resolved',
    ]);
  });

  it('shows events before the start with a negative offset', () => {
    const events = [...anIncident().events, ev('13:58', 'note', 'Pricing service latency starts rising')];
    const lines = section(buildPostmortem(anIncident({ events })).markdown, 'Timeline').split('\n');
    expect(lines[2]).toBe('- 13:58 (-7 min) Pricing service latency starts rising');
    expect(lines[3]).toBe('- 14:05 (+0 min) Deploy 4711 reaches 100%');
  });

  it('uses the earliest event as the start when there is no start event', () => {
    const events = [ev('14:20', 'detected', 'Alert'), ev('14:02', 'note', 'Customer ticket'), ev('14:50', 'mitigated', 'Rolled back'), ev('16:02', 'resolved', 'Done')];
    const { metrics, markdown } = buildPostmortem(anIncident({ events }));
    expect(metrics).toEqual({ timeToDetectMin: 18, timeToMitigateMin: 48, timeToResolveMin: 120 });
    expect(section(markdown, 'Impact').split('\n').slice(2)).toEqual([
      '- Time to detect: 18 min',
      '- Time to mitigate: 48 min',
      '- Time to resolve: 2 h',
    ]);
  });

  it('rounds partial minutes down', () => {
    const events = [
      { at: '2024-05-01T14:05:30.000Z', kind: 'start', text: 'Deploy' },
      { at: '2024-05-01T14:17:29.000Z', kind: 'detected', text: 'Alert' },
      { at: '2024-05-01T14:36:00.000Z', kind: 'mitigated', text: 'Rolled back' },
      { at: '2024-05-01T15:10:00.000Z', kind: 'resolved', text: 'Done' },
    ];
    expect(buildPostmortem(anIncident({ events })).metrics).toEqual({ timeToDetectMin: 11, timeToMitigateMin: 30, timeToResolveMin: 64 });
  });
});

describe('buildPostmortem: problems', () => {
  it('reports missing milestones, writes unknown for their metrics, and returns null', () => {
    const events = [ev('14:05', 'start', 'Deploy'), ev('14:17', 'detected', 'Alert')];
    const { problems, metrics, markdown } = buildPostmortem(anIncident({ events }));
    expect(rules(problems)).toEqual(['missing-event: mitigated', 'missing-event: resolved']);
    expect(metrics).toEqual({ timeToDetectMin: 12, timeToMitigateMin: null, timeToResolveMin: null });
    expect(section(markdown, 'Impact')).toContain('- Time to mitigate: unknown\n- Time to resolve: unknown');
  });

  it('reports milestones out of order, comparing with the nearest earlier one that exists', () => {
    const events = [ev('14:05', 'start', 'Deploy'), ev('14:20', 'detected', 'Alert'), ev('14:15', 'mitigated', 'Flag turned off'), ev('14:30', 'resolved', 'Done')];
    expect(rules(buildPostmortem(anIncident({ events })).problems)).toEqual(['event-order: mitigated']);
    const noDetect = [ev('14:05', 'start', 'Deploy'), ev('14:15', 'resolved', 'Done'), ev('14:20', 'mitigated', 'Rolled back')];
    expect(rules(buildPostmortem(anIncident({ events: noDetect })).problems)).toEqual(['missing-event: detected', 'event-order: resolved']);
  });

  it('flags blaming language in the summary or the timeline, once per phrase, in list order', () => {
    const summary = 'Kim should have added a timeout. Human error, basically. It was careless, and Kim should have known.';
    const events = [...anIncident().events, ev('14:20', 'note', 'On-call failed to acknowledge the page')];
    expect(rules(buildPostmortem(anIncident({ summary, events })).problems)).toEqual([
      'blame: human error',
      'blame: should have',
      'blame: failed to',
      'blame: careless',
    ]);
  });

  it('matches blame phrases as whole words only', () => {
    const summary = 'A faulty default in the client config. Nobody failed tons of checks; the careless-looking diff was fine.';
    expect(rules(buildPostmortem(anIncident({ summary })).problems)).toEqual(['blame: careless']);
    expect(rules(buildPostmortem(anIncident({ summary: 'It was nobody\'s FAULT.' })).problems)).toEqual(['blame: fault']);
  });

  it('reports actions without an owner or a due date, in action order', () => {
    const actions = [
      act('prevent', 'Add a timeout', null, null),
      act('detect', 'Alert sooner', 'lee', null),
      act('process', 'Review deploy checklist', null, '2024-06-01'),
    ];
    expect(rules(buildPostmortem(anIncident({ actions })).problems)).toEqual([
      'action-missing-owner: Add a timeout',
      'action-missing-due: Add a timeout',
      'action-missing-due: Alert sooner',
      'action-missing-owner: Review deploy checklist',
    ]);
  });

  it('asks for a prevent action, and for a detect action when detection took more than 10 minutes', () => {
    const onlyProcess = [act('process', 'Be more careful with deploys')];
    expect(rules(buildPostmortem(anIncident({ actions: onlyProcess })).problems)).toEqual(['no-prevent-action', 'no-detect-action']);
    const fastDetection = [ev('14:05', 'start', 'Deploy'), ev('14:15', 'detected', 'Alert'), ev('14:20', 'mitigated', 'Rolled back'), ev('14:40', 'resolved', 'Done')];
    expect(rules(buildPostmortem(anIncident({ events: fastDetection, actions: [act('prevent', 'Timeout')] })).problems)).toEqual([]);
    expect(rules(buildPostmortem(anIncident({ actions: [act('mitigate', 'Faster rollback')] })).problems)).toEqual(['no-prevent-action', 'no-detect-action']);
  });

  it('does not ask for a detect action when detection time is unknown', () => {
    const events = [ev('14:05', 'start', 'Deploy'), ev('14:36', 'mitigated', 'Rolled back'), ev('15:10', 'resolved', 'Done')];
    expect(rules(buildPostmortem(anIncident({ events, actions: [act('prevent', 'Timeout')] })).problems)).toEqual(['missing-event: detected']);
  });
});

describe('buildPostmortem: action items table', () => {
  it('orders rows by type, keeps input order within a type, and fills in missing owner and due', () => {
    const actions = [
      act('process', 'Update the deploy checklist', 'sam'),
      act('detect', 'Alert on p99 latency', null, null),
      act('prevent', 'Add a timeout', 'kim'),
      act('mitigate', 'One-click rollback', 'lee'),
      act('prevent', 'Circuit breaker on pricing', 'ana', '2024-05-20'),
    ];
    const rows = section(buildPostmortem(anIncident({ actions })).markdown, 'Action items').split('\n').slice(4);
    expect(rows).toEqual([
      '| prevent | Add a timeout | @kim | 2024-05-10 |',
      '| prevent | Circuit breaker on pricing | @ana | 2024-05-20 |',
      '| detect | Alert on p99 latency | (unassigned) | (none) |',
      '| mitigate | One-click rollback | @lee | 2024-05-10 |',
      '| process | Update the deploy checklist | @sam | 2024-05-10 |',
    ]);
  });

  it('escapes a pipe inside an action', () => {
    const actions = [act('prevent', 'Validate input | reject NaN totals')];
    expect(buildPostmortem(anIncident({ actions })).markdown).toContain('| prevent | Validate input \\| reject NaN totals | @kim | 2024-05-10 |');
  });

  it('writes None. when there are no actions, and ends the document with one newline', () => {
    const { markdown } = buildPostmortem(anIncident({ actions: [] }));
    expect(markdown.endsWith('## Action items\n\nNone.\n')).toBe(true);
  });
});

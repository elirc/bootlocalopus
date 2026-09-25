const { judgeCanary } = solution;

const POLICY = { minRequests: 500, maxErrorRateIncrease: 0.01, maxLatencyRatio: 1.25, abortAfterErrors: 50, healthyChecks: 3 };

/** A healthy window: canary gets a tenth of the traffic and behaves like the baseline. */
const aWindow = ({ baseline = {}, canary = {} } = {}) => ({
  baseline: { requests: 10000, errors: 100, p99Ms: 200, ...baseline },
  canary: { requests: 1000, errors: 10, p99Ms: 205, ...canary },
});
const healthy = () => aWindow();
const judge = (checks, policy = POLICY) => judgeCanary(checks, policy);

const PROMOTE = { verdict: 'promote', reasons: [] };
const WAIT = { verdict: 'wait', reasons: [] };

describe('judgeCanary: promoting', () => {
  it('promotes after the required number of healthy windows in a row', () => {
    expect(judge([healthy(), healthy(), healthy()])).toEqual(PROMOTE);
  });

  it('waits until there are enough windows', () => {
    expect(judge([])).toEqual(WAIT);
    expect(judge([healthy()])).toEqual(WAIT);
    expect(judge([healthy(), healthy()])).toEqual(WAIT);
  });

  it('reads healthyChecks from the policy', () => {
    expect(judge([healthy()], { ...POLICY, healthyChecks: 1 })).toEqual(PROMOTE);
    expect(judge([healthy(), healthy(), healthy()], { ...POLICY, healthyChecks: 4 })).toEqual(WAIT);
  });

  it('only counts the most recent streak', () => {
    const slow = aWindow({ canary: { p99Ms: 400 } });
    expect(judge([healthy(), healthy(), healthy(), slow, healthy(), healthy()])).toEqual(WAIT);
    expect(judge([slow, healthy(), healthy(), healthy()])).toEqual(PROMOTE);
  });
});

describe('judgeCanary: sample size', () => {
  it('treats a window with too few canary or baseline requests as insufficient, not healthy', () => {
    const quiet = aWindow({ canary: { requests: 14, errors: 0 } });
    expect(judge([healthy(), healthy(), quiet])).toEqual(WAIT);
    const quietBaseline = aWindow({ baseline: { requests: 400, errors: 0 } });
    expect(judge([healthy(), healthy(), quietBaseline])).toEqual(WAIT);
  });

  it('lets an insufficient window break the streak', () => {
    const quiet = aWindow({ canary: { requests: 499, errors: 0 } });
    expect(judge([healthy(), healthy(), quiet, healthy(), healthy()])).toEqual(WAIT);
  });

  it('does not roll back on a bad-looking but tiny sample', () => {
    // 3 errors in 20 requests is 15 %, but 20 requests prove nothing.
    expect(judge([aWindow({ canary: { requests: 20, errors: 3 } })])).toEqual(WAIT);
  });

  it('judges a window with exactly minRequests', () => {
    expect(judge([aWindow({ canary: { requests: 500, errors: 5 } })], { ...POLICY, healthyChecks: 1 })).toEqual(PROMOTE);
  });

  it('rolls back at abortAfterErrors canary errors, whatever the traffic', () => {
    expect(judge([aWindow({ canary: { requests: 60, errors: 50 } })])).toEqual({ verdict: 'rollback', reasons: ['error-rate'] });
    expect(judge([aWindow({ canary: { requests: 60, errors: 49 } })])).toEqual(WAIT);
  });
});

describe('judgeCanary: error rate', () => {
  it('compares rates, so a canary with a tenth of the traffic and a tenth of the errors is healthy', () => {
    const w = aWindow({ baseline: { requests: 20000, errors: 400 }, canary: { requests: 2000, errors: 40 } });
    expect(judge([w, w, w])).toEqual(PROMOTE);
  });

  it('rolls back when the canary rate is more than the allowed increase above the baseline', () => {
    // baseline 1 %, canary 2.1 %: 1.1 points worse
    expect(judge([healthy(), aWindow({ canary: { errors: 21 } })])).toEqual({ verdict: 'rollback', reasons: ['error-rate'] });
  });

  it('allows exactly the maximum increase', () => {
    // baseline 1 %, canary 2 %: exactly 1 point
    const w = aWindow({ canary: { errors: 20 } });
    expect(judge([w, w, w])).toEqual(PROMOTE);
  });

  it('uses the difference, so a baseline with no errors does not make one canary error fatal', () => {
    const w = aWindow({ baseline: { errors: 0 }, canary: { errors: 1 } });
    expect(judge([w, w, w])).toEqual(PROMOTE);
  });

  it('does not blame the canary when both fleets are having a bad day', () => {
    const w = aWindow({ baseline: { errors: 800 }, canary: { requests: 500, errors: 42 } }); // 8 % and 8.4 %
    expect(judge([w, w, w])).toEqual(PROMOTE);
  });
});

describe('judgeCanary: latency', () => {
  it('rolls back when canary p99 is more than the allowed ratio of baseline p99', () => {
    expect(judge([aWindow({ canary: { p99Ms: 251 } })])).toEqual({ verdict: 'rollback', reasons: ['latency'] });
  });

  it('allows exactly the ratio', () => {
    const w = aWindow({ canary: { p99Ms: 250 } });
    expect(judge([w, w, w])).toEqual(PROMOTE);
  });

  it('reports both reasons, error rate first', () => {
    expect(judge([aWindow({ canary: { errors: 40, p99Ms: 900 } })])).toEqual({ verdict: 'rollback', reasons: ['error-rate', 'latency'] });
  });
});

describe('judgeCanary: which window decides', () => {
  it('rolls back on the latest window even after a healthy streak', () => {
    expect(judge([healthy(), healthy(), healthy(), aWindow({ canary: { p99Ms: 300 } })])).toEqual({ verdict: 'rollback', reasons: ['latency'] });
  });

  it('does not roll back for an older bad window once the latest is fine', () => {
    expect(judge([aWindow({ canary: { errors: 30 } }), healthy()])).toEqual(WAIT);
  });
});

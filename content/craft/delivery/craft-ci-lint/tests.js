const { lintWorkflow } = solution;

const SHA = '8e5e7e5ab8b370d6c329ec480221332ada57f0ab';

/** A clean job; override what the test is about. */
const aJob = (overrides = {}) => ({
  'runs-on': 'ubuntu-latest',
  'timeout-minutes': 10,
  steps: [{ uses: 'actions/checkout@v4' }, { run: 'npm ci && npm test' }],
  ...overrides,
});

/** A clean workflow; override what the test is about. */
const aWorkflow = (overrides = {}) => ({
  name: 'ci',
  on: { pull_request: {} },
  permissions: { contents: 'read' },
  jobs: { test: aJob() },
  ...overrides,
});

const key = (p) => `${p.where} ${p.rule}`;
/** Problems as sorted "where rule" strings: the order is not part of the contract. */
const lint = (wf) => lintWorkflow(wf).map(key).sort();

describe('lintWorkflow: a clean workflow', () => {
  it('reports nothing', () => {
    expect(lint(aWorkflow())).toEqual([]);
  });

  it('returns objects with exactly rule and where', () => {
    const job = aJob();
    delete job['timeout-minutes'];
    expect(lintWorkflow(aWorkflow({ jobs: { test: job } }))).toEqual([{ rule: 'no-timeout', where: 'jobs.test' }]);
  });
});

describe('lintWorkflow: workflow and job rules', () => {
  it('reports a workflow without top-level permissions', () => {
    const wf = aWorkflow();
    delete wf.permissions;
    expect(lint(wf)).toEqual(['workflow no-permissions']);
  });

  it('reports a job without a timeout, and accepts any timeout that is set', () => {
    const noTimeout = aJob();
    delete noTimeout['timeout-minutes'];
    expect(lint(aWorkflow({ jobs: { build: aJob({ 'timeout-minutes': 5 }), test: noTimeout } }))).toEqual(['jobs.test no-timeout']);
  });

  it('reports needs that name a missing job, once per job, for a string or an array', () => {
    const wf = aWorkflow({
      jobs: {
        build: aJob(),
        test: aJob({ needs: 'biuld' }),
        deploy: aJob({ needs: ['build', 'test', 'lint', 'e2e'] }),
      },
    });
    expect(lint(wf)).toEqual(['jobs.deploy unknown-need', 'jobs.test unknown-need']);
  });

  it('accepts needs that all exist', () => {
    const wf = aWorkflow({ jobs: { build: aJob(), test: aJob({ needs: 'build' }), deploy: aJob({ needs: ['build', 'test'] }) } });
    expect(lint(wf)).toEqual([]);
  });

  it('reports every job on a needs cycle, and not the jobs that only depend on it', () => {
    const wf = aWorkflow({
      jobs: {
        a: aJob({ needs: 'c' }),
        b: aJob({ needs: ['a'] }),
        c: aJob({ needs: ['b'] }),
        d: aJob({ needs: ['a'] }),
        e: aJob(),
      },
    });
    expect(lint(wf)).toEqual(['jobs.a needs-cycle', 'jobs.b needs-cycle', 'jobs.c needs-cycle']);
  });

  it('reports a job that needs itself, and a cycle reached through a diamond', () => {
    const wf = aWorkflow({
      jobs: {
        self: aJob({ needs: 'self' }),
        top: aJob({ needs: ['left', 'right'] }),
        left: aJob({ needs: 'bottom' }),
        right: aJob({ needs: 'bottom' }),
        bottom: aJob({ needs: 'top' }),
        clean1: aJob(),
        clean2: aJob({ needs: ['clean1'] }),
      },
    });
    expect(lint(wf)).toEqual([
      'jobs.bottom needs-cycle', 'jobs.left needs-cycle', 'jobs.right needs-cycle', 'jobs.self needs-cycle', 'jobs.top needs-cycle',
    ]);
  });
});

describe('lintWorkflow: pinning actions', () => {
  const withUses = (...uses) => aWorkflow({ jobs: { test: aJob({ steps: uses.map((u) => ({ uses: u })) }) } });

  it('accepts first-party actions on a tag, anything on a full sha, local and docker actions', () => {
    expect(lint(withUses(
      'actions/checkout@v4',
      'actions/setup-node@v4.0.2',
      'github/codeql-action/init@v3',
      `some-org/deploy-action@${SHA}`,
      `aws-actions/configure-aws-credentials/sub/path@${SHA}`,
      './.github/actions/setup',
      'docker://alpine:3.19',
    ))).toEqual([]);
  });

  it('reports third-party actions on a tag or branch, with the step index', () => {
    expect(lint(withUses('actions/checkout@v4', 'some-org/deploy-action@v2', 'tj-actions/changed-files@main'))).toEqual([
      'jobs.test.steps[1] unpinned-action',
      'jobs.test.steps[2] unpinned-action',
    ]);
  });

  it('reports a short sha, an upper-case sha and a missing ref', () => {
    expect(lint(withUses('some-org/x@8e5e7e5', `some-org/y@${SHA.toUpperCase()}`, 'actions/checkout'))).toEqual([
      'jobs.test.steps[0] unpinned-action',
      'jobs.test.steps[1] unpinned-action',
      'jobs.test.steps[2] unpinned-action',
    ]);
  });
});

describe('lintWorkflow: untrusted input in run', () => {
  const withRun = (...runs) => aWorkflow({ jobs: { test: aJob({ steps: runs.map((r) => ({ run: r })) }) } });

  it('reports PR titles, bodies, branch names and commit messages pasted into a script', () => {
    expect(lint(withRun(
      'echo "Title: ${{ github.event.pull_request.title }}"',
      'echo "${{ github.event.issue.body }}" > body.txt',
      './deploy.sh ${{ github.head_ref }}',
      'git checkout ${{ github.event.pull_request.head.ref }}',
      'echo ${{github.event.head_commit.message}}',
    ))).toEqual([
      'jobs.test.steps[0] untrusted-input',
      'jobs.test.steps[1] untrusted-input',
      'jobs.test.steps[2] untrusted-input',
      'jobs.test.steps[3] untrusted-input',
      'jobs.test.steps[4] untrusted-input',
    ]);
  });

  it('accepts safe expressions, and untrusted names outside an expression', () => {
    expect(lint(withRun(
      'echo "${{ github.sha }} ${{ github.event.pull_request.number }} ${{ github.event.pull_request.head.sha }}"',
      'echo "$PR_TITLE"  # github.event.pull_request.title passed through env instead',
      'npm run build -- --title=${{ matrix.title }}',
    ))).toEqual([]);
  });
});

describe('lintWorkflow: pull_request_target', () => {
  const checkoutHead = { uses: 'actions/checkout@v4', with: { ref: '${{ github.event.pull_request.head.sha }}' } };

  it('reports checking out the PR head under pull_request_target, however `on` is written', () => {
    for (const on of ['pull_request_target', ['push', 'pull_request_target'], { pull_request_target: { types: ['opened'] } }]) {
      const wf = aWorkflow({ on, jobs: { test: aJob({ steps: [checkoutHead, { run: 'npm ci && npm test' }] }) } });
      expect(lint(wf)).toEqual(['jobs.test.steps[0] pr-target-checkout']);
    }
  });

  it('accepts the same checkout under pull_request, and a plain checkout under pull_request_target', () => {
    expect(lint(aWorkflow({ on: ['pull_request'], jobs: { test: aJob({ steps: [checkoutHead] }) } }))).toEqual([]);
    expect(lint(aWorkflow({ on: 'pull_request_target', jobs: { test: aJob({ steps: [{ uses: 'actions/checkout@v4' }] }) } }))).toEqual([]);
  });
});

describe('lintWorkflow: everything at once', () => {
  it('reports every problem in a realistic bad workflow', () => {
    const wf = {
      name: 'deploy',
      on: { pull_request_target: {}, push: { branches: ['main'] } },
      jobs: {
        test: {
          'runs-on': 'ubuntu-latest',
          steps: [
            { uses: 'actions/checkout@v4', with: { ref: '${{ github.event.pull_request.head.ref }}' } },
            { run: 'npm ci && npm test' },
          ],
        },
        deploy: {
          'runs-on': 'ubuntu-latest',
          'timeout-minutes': 15,
          needs: ['test', 'lint'],
          steps: [
            { uses: 'cool-dev/ssh-deploy@v1' },
            { run: 'echo "Deploying ${{ github.event.pull_request.title }}"' },
          ],
        },
      },
    };
    expect(lint(wf)).toEqual([
      'jobs.deploy unknown-need',
      'jobs.deploy.steps[0] unpinned-action',
      'jobs.deploy.steps[1] untrusted-input',
      'jobs.test no-timeout',
      'jobs.test.steps[0] pr-target-checkout',
      'workflow no-permissions',
    ]);
  });
});

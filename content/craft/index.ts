import { track } from '../types.ts';

export const craftTrack = track({
  id: 'craft',
  title: 'Engineering Craft',
  icon: '🛠',
  color: '#b48ead',
  weight: 0.9,
  blurb: 'The judgement calls nobody writes a ticket for: reviewing code, using git deliberately, debugging systematically, scoping work honestly, and keeping a service observable. This is the part that actually gets you promoted.',
  chapters: [
    /* ================================================================== */
    {
      id: 'craft-working',
      title: 'Working Like a Mid',
      summary: 'Code review, git, debugging method, and refactoring under test.',
      lessons: [
        {
          id: 'craft-code-review',
          title: 'Reviewing code well',
          kind: 'quiz',
          xp: 65,
          why: 'Reviewing is the first mid-level responsibility you get handed, and the fastest way to be trusted or distrusted.',
          tags: ['code review', 'collaboration'],
          brief: `A junior review comments on formatting. A mid-level review asks whether
the change is correct, whether it will be understood in six months, and whether
anything about it will page someone at 3am.

The other half of the skill is *how* you say it: a review is a conversation
with a colleague, not a defect report.`,
          quiz: [
            {
              q: 'You are reviewing a 900-line PR that mixes a refactor, a bug fix and a new feature. What is the most useful first response?',
              options: [
                'Read it all carefully and leave comments on everything you find',
                'Ask for it to be split, explaining that mixed concerns make the bug fix impossible to review or revert independently',
                'Approve it — the author knows the code better than you do',
                'Reject it without comment; the size speaks for itself',
              ],
              answer: [1],
              explain: 'Size is the review problem, so fix that first. A mixed PR cannot be reverted selectively when the bug fix turns out to be wrong, and reviewers skim past a certain length — the defect-detection rate drops sharply. Ask early and explain the reason, before either of you sinks time into line-by-line comments.',
            },
            {
              q: 'Which of these belong in a code review comment? Select all.',
              options: [
                'A correctness problem: this loses the error when the promise rejects',
                'A missing test for the branch the PR just introduced',
                'A naming choice that will confuse the next reader, offered as a suggestion',
                'Reformatting preferences your linter does not enforce',
              ],
              answer: [0, 1, 2],
              explain: 'Correctness, coverage, and clarity are all fair. Style that a tool does not enforce is not: either configure the linter so the machine says it, or let it go. Hand-policing formatting burns the goodwill you need for the comments that matter.',
            },
            {
              q: 'You are fairly sure a line is wrong but you do not know the domain well. How do you phrase it?',
              options: [
                'This is broken, fix it',
                'Ask: "what happens here if `items` is empty? I think this throws, but I may be missing something upstream"',
                'Say nothing, since you are not certain',
                'Approve, and open a separate bug ticket afterwards',
              ],
              answer: [1],
              explain: 'A specific question with your reasoning shown gets the answer either way: you learn the constraint you were missing, or the author sees the bug. Staying silent because you are unsure is how bugs ship — uncertainty is a reason to ask, not to withhold.',
            },
            {
              q: 'A PR is correct but you would have structured it differently. What now?',
              options: [
                'Request changes until it matches your structure',
                'Approve, and if the alternative is genuinely better, mention it as a non-blocking note',
                'Approve silently and rewrite it yourself later',
                'Escalate to the tech lead to decide',
              ],
              answer: [1],
              explain: 'Correct-but-different is not a defect. Blocking on personal preference makes you a bottleneck and teaches people to avoid your reviews. Say it once as a non-blocking note; if the structure really matters, it belongs in a team convention rather than one PR.',
            },
            {
              q: 'What does a review comment marked "nit:" mean, and how should it be treated?',
              options: [
                'A minor, non-blocking observation the author may take or leave',
                'A blocking issue phrased politely',
                'A note for a future PR that should not be addressed now',
                'A formatting error the linter missed',
              ],
              answer: [0],
              explain: 'Prefixing "nit:" is a signal about severity, which is genuinely useful — it tells the author what to prioritise and what they are free to ignore. It stops being useful the moment you also block approval on your nits.',
            },
            {
              q: 'Your review finds a design problem that would take a week to address properly, in a PR that must ship today for a customer commitment. Best move?',
              options: [
                'Block until the design is fixed',
                'Approve and say nothing',
                'Approve for the deadline, write down the specific problem and its risk, and get a ticket scheduled — with the author and the person owning the deadline both aware',
                'Approve and fix the design yourself over the weekend',
              ],
              answer: [2],
              explain: 'Deliberate, recorded, visible debt is engineering. Silent debt is a trap for whoever touches the code next, and blocking a commitment over something that takes a week is a decision above your pay grade — surface the trade-off and let it be made with eyes open.',
            },
            {
              q: 'Which of these are signs your own PR will get a good review? Select all.',
              options: [
                'A description explaining why the change exists, not just what it does',
                'It is small and does one thing',
                'You have left comments on your own non-obvious decisions',
                'It includes several unrelated drive-by cleanups so the codebase improves faster',
              ],
              answer: [0, 1, 2],
              explain: 'Context, size and self-annotation all raise review quality — you are doing the reviewer\'s hardest work for them. Drive-by cleanups do the opposite: they hide the real change in noise. Send them separately, where they are trivially approvable.',
            },
          ],
        },
        {
          id: 'craft-git',
          title: 'Git with intent',
          kind: 'quiz',
          xp: 65,
          why: 'Every team has someone who can untangle git and someone who is afraid of it. Being the first one saves the team hours.',
          tags: ['git', 'version control'],
          brief: `Git is a content-addressed graph with a few pointers into it. Almost every
scary situation is recoverable, because commits are only unreachable, not gone,
until garbage collection. Understanding the model beats memorising commands.`,
          quiz: [
            {
              q: 'You committed to `main` locally but meant to work on a branch. Nothing is pushed. Simplest fix?',
              options: [
                'Create a branch at the current commit, then move `main` back: `git branch feature && git reset --hard origin/main`',
                'Revert the commit and redo the work on a branch',
                'Delete the repository and re-clone',
                'Cherry-pick the commit onto a new branch, then force-push main',
              ],
              answer: [0],
              explain: 'A branch is just a pointer. Create one where you are, then move `main` back to the remote\'s position. `git switch -c feature` followed by resetting main works the same way. Nothing is pushed, so nobody else is affected and no force-push is needed.',
            },
            {
              q: 'A bad commit is already on `main` and other people have pulled it. What should you do?',
              options: [
                '`git revert <sha>` — a new commit that undoes it',
                '`git reset --hard <previous>` and force-push',
                '`git rebase -i` to drop the commit and force-push',
                'Amend the commit and force-push',
              ],
              answer: [0],
              explain: 'Once history is shared, rewriting it breaks everyone who has it — their next pull conflicts or silently resurrects the change. `revert` adds a new commit that undoes the old one, keeping history append-only. Rewriting is only safe on branches nobody else has.',
            },
            {
              q: 'What is the practical difference between merging and rebasing your feature branch onto an updated `main`?',
              options: [
                'Merge preserves the real history and adds a merge commit; rebase replays your commits on top of main, giving a linear history but new commit hashes',
                'Rebase is always safer',
                'Merge loses commits; rebase keeps them',
                'They produce identical results with different commands',
              ],
              answer: [0],
              explain: 'Both get you up to date; they differ in the history they leave and in the hashes. Because rebase rewrites your commits, it is fine on a branch only you have and hostile on one others are building on. That is the whole trade-off — the rest is team taste.',
            },
            {
              q: 'A bug appeared somewhere in the last 200 commits and you have a reliable way to reproduce it. Fastest way to find the commit that introduced it?',
              options: [
                '`git bisect` — binary search over the range, testing each midpoint',
                'Read the diff of all 200 commits',
                '`git blame` on the file you suspect',
                'Revert commits one at a time from the newest',
              ],
              answer: [0],
              explain: 'Bisect finds it in about 8 steps instead of 200. With a script that exits non-zero on the bug, `git bisect run ./check.sh` automates the whole search. `blame` is for "who last touched this line", which is a different question and misleads when the bug is an interaction.',
            },
            {
              q: 'You ran `git reset --hard` and lost a commit you needed. It was never pushed. Is it recoverable?',
              options: [
                'Yes — `git reflog` lists where HEAD has been, and you can reset or cherry-pick back to that commit',
                'No, `--hard` is permanent',
                'Only if you have a backup of the working directory',
                'Only via the remote, which does not have it',
              ],
              answer: [0],
              explain: 'The commit object still exists; you only moved the pointer away from it. `git reflog` shows HEAD\'s history, including the abandoned position, and you can get back with `git reset --hard <sha>` or cherry-pick it. Unreachable commits survive until garbage collection, typically weeks later. What `--hard` does destroy permanently is *uncommitted* work.',
            },
            {
              q: 'Which of these make a commit message genuinely useful? Select all.',
              options: [
                'A subject line saying what changed, in the imperative',
                'A body explaining why, especially any non-obvious constraint',
                'A reference to the ticket or incident that prompted it',
                'A list of every file touched',
              ],
              answer: [0, 1, 2],
              explain: 'The what is visible in the diff; the why is not, and that is what someone reading `git log` in a year actually needs. Listing files duplicates information git already has, and goes stale the moment the commit is amended.',
            },
            {
              q: 'What is `git stash` appropriate for?',
              options: [
                'Parking uncommitted changes briefly to switch context, expecting to pop them shortly',
                'Long-term storage of work in progress',
                'Sharing work with a colleague',
                'Saving work before a `--hard` reset, as a substitute for committing',
              ],
              answer: [0],
              explain: 'A stash is a short-lived, local, easily forgotten stack. Anything you want to keep, share, or come back to next week belongs on a branch as a commit — a WIP commit costs nothing and can be amended or squashed later.',
            },
          ],
        },
        {
          id: 'craft-debugging',
          title: 'Debugging as a method',
          kind: 'quiz',
          xp: 70,
          why: 'The difference between an hour and a day is method, not cleverness. This is the most transferable skill on the list.',
          tags: ['debugging', 'method'],
          brief: `Debugging is not inspiration. It is: reproduce it reliably, form one
hypothesis, design the cheapest observation that would disprove it, run it,
narrow. The failure mode is changing several things at once and losing track of
what you have actually ruled out.`,
          quiz: [
            {
              q: 'A bug is reported that you cannot reproduce. What is the highest-value next step?',
              options: [
                'Guess at a fix and ship it, then see if reports stop',
                'Invest in reproducing it: exact version, data, browser, timing, sequence — a reliable reproduction is most of the fix',
                'Close it as not reproducible',
                'Add logging everywhere and wait',
              ],
              answer: [1],
              explain: 'Without a reproduction you cannot confirm a fix — you can only stop seeing reports, which is not the same thing. Reproduction also usually reveals the cause on its own, because the conditions you need to recreate it *are* the bug. Adding logging is a fine tactic, but targeted at a hypothesis rather than sprayed everywhere.',
            },
            {
              q: 'You have a hypothesis about the cause. What is the ideal next action?',
              options: [
                'Implement the fix and see if the bug goes away',
                'Design the cheapest observation that would prove the hypothesis WRONG, and run that',
                'Ask a senior colleague to confirm your hypothesis',
                'Refactor the surrounding code so the bug cannot happen',
              ],
              answer: [1],
              explain: 'Seeking disconfirmation is what stops you spending a day defending a wrong theory. A fix that appears to work is weak evidence: it may have masked the symptom, or the bug may be intermittent. Prove the mechanism, then fix it.',
            },
            {
              q: 'A bug happens only in production. Which are legitimate ways to narrow it down? Select all.',
              options: [
                'Compare configuration and data between environments — the difference is the clue',
                'Add structured logging around the suspect path and deploy it',
                'Reproduce with a copy of production-shaped data locally',
                'Change three suspicious things at once to save deploys',
              ],
              answer: [0, 1, 2],
              explain: '"Works locally" means something differs: config, data volume, concurrency, clock, network. Chasing that difference is the whole game. Changing three things at once means a fix tells you nothing about which one mattered — and if the bug persists you have ruled out nothing.',
            },
            {
              q: 'Intermittent test failure, about 1 run in 20. Most likely causes? Select all.',
              options: [
                'Tests sharing mutable state and running in a different order',
                'A race: an assertion that does not wait for an async update',
                'Time or timezone dependence, e.g. a date boundary',
                'The test framework being unreliable',
              ],
              answer: [0, 1, 2],
              explain: 'Shared state, unawaited async, and clock dependence account for the overwhelming majority of flakes. The framework is almost never the problem. Retrying a flaky test until it passes hides a real race that will eventually bite in production — flakes are bug reports.',
            },
            {
              q: 'What does a stack trace actually tell you?',
              options: [
                'The path of calls that led to the throw — the site of the symptom, not necessarily the cause',
                'The line containing the bug',
                'Which variable was wrong',
                'The complete history of program execution',
              ],
              answer: [0],
              explain: 'The trace shows where the program noticed a problem. The cause is frequently further back: a null that was inserted three functions earlier, or a config value never set. Read the trace to find where to start looking upstream, not as a verdict.',
            },
            {
              q: 'You have been stuck for two hours. Which of these are genuinely good moves? Select all.',
              options: [
                'Write down what you know, what you have ruled out, and what you assumed',
                'Explain it out loud to a colleague, even one unfamiliar with the code',
                'Take a break',
                'Keep going — stopping now wastes the context you have built',
              ],
              answer: [0, 1, 2],
              explain: 'Two hours stuck usually means a wrong assumption you have not examined. Writing it down and explaining it both force the assumptions into the open, which is why rubber-ducking works. Pushing through on momentum is how the third hour becomes the sixth.',
            },
            {
              q: 'You found and fixed the bug. What should you also do?',
              options: [
                'Add a test that fails without the fix, and check whether the same mistake exists elsewhere',
                'Nothing — the bug is fixed',
                'Refactor the whole module while you understand it',
                'Add a comment warning others not to touch the code',
              ],
              answer: [0],
              explain: 'The regression test is what stops it coming back, and a bug is usually an instance of a pattern — the same off-by-one or unawaited promise often appears in three other places. That search is the cheapest bug-finding you will ever do, because you already know exactly what to look for.',
            },
          ],
        },
        {
          id: 'craft-refactor',
          title: 'Refactoring under test',
          kind: 'js',
          xp: 100,
          why: 'Being trusted to improve code you did not write, without breaking it, is the definition of mid-level.',
          tags: ['refactoring', 'readability', 'testability'],
          brief: `\`processOrder\` below works. Every test in this lesson passes before you
change anything — that is deliberate. Refactoring means changing structure
while behaviour stays identical, and the tests are what prove it.

What is wrong with it: one function does five jobs, the money maths is
duplicated, a magic number is buried in a branch, and the whole thing is
untestable in pieces.

## Task

Keep \`processOrder(order, config)\` working exactly as it does now, and
additionally export these pure functions, each doing one job:

- \`subtotalCents(items)\` — sum of \`quantity * unitCents\`
- \`discountCents(subtotal, config)\` — the discount, applying
  \`config.discountPercent\` and honouring \`config.maxDiscountCents\`
- \`shippingCents(subtotal, config)\` — \`config.shippingCents\`, or \`0\` when the
  subtotal reaches \`config.freeShippingThresholdCents\`
- \`taxCents(taxable, config)\` — \`config.taxPercent\` of the taxable amount
- \`validateOrder(order)\` — returns an array of problem strings (empty when
  valid)

\`processOrder\` must then be a short composition of those. All money is integer
cents, and every intermediate is rounded with \`Math.round\` at the point the
original code rounds.`,
          starter: `export function processOrder(order, config) {
  // validation
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return { ok: false, problems: ['order must have at least one item'] };
  }
  const problems = [];
  for (const item of order.items) {
    if (!item.sku) problems.push('item missing sku');
    if (!(item.quantity > 0)) problems.push('quantity must be positive');
    if (!(item.unitCents > 0)) problems.push('unitCents must be positive');
  }
  if (problems.length) return { ok: false, problems };

  // totals
  let subtotal = 0;
  for (const item of order.items) {
    subtotal = subtotal + item.quantity * item.unitCents;
  }

  let discount = 0;
  if (config.discountPercent) {
    discount = Math.round(subtotal * (config.discountPercent / 100));
    if (config.maxDiscountCents && discount > config.maxDiscountCents) {
      discount = config.maxDiscountCents;
    }
  }

  let shipping = config.shippingCents || 0;
  if (subtotal - discount >= 5000) {
    shipping = 0;
  }

  const tax = Math.round((subtotal - discount + shipping) * (config.taxPercent / 100));

  return {
    ok: true,
    problems: [],
    subtotalCents: subtotal,
    discountCents: discount,
    shippingCents: shipping,
    taxCents: tax,
    totalCents: subtotal - discount + shipping + tax,
  };
}
`,
          hints: [
            'Read the original carefully first, especially the `5000`: free shipping is decided on the subtotal *after* discount, and 5000 is really `config.freeShippingThresholdCents` with a default.',
            'Extract one function at a time and run the tests after each. That way a failure points at the step you just took.',
            'Keep the rounding exactly where it was: discount rounds, tax rounds, and the subtotal is a plain integer sum. Moving a `Math.round` is a behaviour change, not a refactor.',
            '`validateOrder` should return the same problems in the same order the original pushed them — per item, sku then quantity then unitCents.',
            'Once the pieces exist, `processOrder` is: validate, then compute subtotal, discount, shipping, tax, and assemble the result.',
          ],
          solution: `const DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS = 5000;

export function subtotalCents(items) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitCents, 0);
}

export function discountCents(subtotal, config) {
  if (!config.discountPercent) return 0;
  const raw = Math.round(subtotal * (config.discountPercent / 100));
  return config.maxDiscountCents ? Math.min(raw, config.maxDiscountCents) : raw;
}

export function shippingCents(subtotal, config) {
  // The original compares the post-discount amount against a hardcoded 5000;
  // that number is really a configurable threshold.
  const threshold = config.freeShippingThresholdCents ?? DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS;
  return subtotal >= threshold ? 0 : (config.shippingCents || 0);
}

export function taxCents(taxable, config) {
  return Math.round(taxable * (config.taxPercent / 100));
}

export function validateOrder(order) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return ['order must have at least one item'];
  }
  const problems = [];
  for (const item of order.items) {
    if (!item.sku) problems.push('item missing sku');
    if (!(item.quantity > 0)) problems.push('quantity must be positive');
    if (!(item.unitCents > 0)) problems.push('unitCents must be positive');
  }
  return problems;
}

export function processOrder(order, config) {
  const problems = validateOrder(order);
  if (problems.length) return { ok: false, problems };

  const subtotal = subtotalCents(order.items);
  const discount = discountCents(subtotal, config);
  const shipping = shippingCents(subtotal - discount, config);
  const tax = taxCents(subtotal - discount + shipping, config);

  return {
    ok: true,
    problems: [],
    subtotalCents: subtotal,
    discountCents: discount,
    shippingCents: shipping,
    taxCents: tax,
    totalCents: subtotal - discount + shipping + tax,
  };
}
`,
          tests: `const config = {
  discountPercent: 10,
  maxDiscountCents: 2000,
  shippingCents: 499,
  taxPercent: 20,
  freeShippingThresholdCents: 5000,
};

const order = (items) => ({ items });
const item = (over = {}) => ({ sku: 'SKU-1', quantity: 1, unitCents: 1000, ...over });

describe('behaviour is unchanged (these passed before your refactor too)', () => {
  it('computes a simple order', () => {
    const out = solution.processOrder(order([item({ quantity: 2, unitCents: 1000 })]), config);
    // subtotal 2000, discount 200, shipping 499 (under threshold), tax 20% of 2299
    expect(out.ok).toBe(true);
    expect(out.subtotalCents).toBe(2000);
    expect(out.discountCents).toBe(200);
    expect(out.shippingCents).toBe(499);
    expect(out.taxCents).toBe(460);
    expect(out.totalCents).toBe(2000 - 200 + 499 + 460);
  });

  it('gives free shipping once the post-discount subtotal reaches the threshold', () => {
    // subtotal 4000, discount 10% = 400, so 3600 -- under 5000, shipping applies
    const under = solution.processOrder(order([item({ quantity: 4, unitCents: 1000 })]), config);
    expect(under.subtotalCents).toBe(4000);
    expect(under.discountCents).toBe(400);
    expect(under.shippingCents).toBe(499);

    // subtotal 6000, discount 600, so 5400 -- at or over 5000, shipping is free
    const over = solution.processOrder(order([item({ quantity: 6, unitCents: 1000 })]), config);
    expect(over.discountCents).toBe(600);
    expect(over.shippingCents).toBe(0);
  });

  it('decides free shipping on the post-discount amount, not the raw subtotal', () => {
    // subtotal 5200, discount 520 -> 4680, which is below the threshold even
    // though the subtotal is above it.
    const out = solution.processOrder(order([item({ quantity: 52, unitCents: 100 })]), config);
    expect(out.subtotalCents).toBe(5200);
    expect(out.shippingCents).toBe(499);
  });

  it('caps the discount', () => {
    const out = solution.processOrder(order([item({ quantity: 100, unitCents: 1000 })]), config);
    expect(out.discountCents).toBe(2000);
  });

  it('handles no discount configured', () => {
    const out = solution.processOrder(order([item()]), { shippingCents: 500, taxPercent: 10 });
    expect(out.discountCents).toBe(0);
    expect(out.subtotalCents).toBe(1000);
    expect(out.shippingCents).toBe(500);
    expect(out.taxCents).toBe(150);
  });

  it('sums several items', () => {
    const out = solution.processOrder(order([
      item({ quantity: 2, unitCents: 999 }),
      item({ sku: 'SKU-2', quantity: 3, unitCents: 250 }),
    ]), config);
    expect(out.subtotalCents).toBe(2 * 999 + 3 * 250);
  });

  it('rejects an empty order', () => {
    const out = solution.processOrder(order([]), config);
    expect(out.ok).toBe(false);
    expect(out.problems).toEqual(['order must have at least one item']);
  });

  it('rejects a missing order', () => {
    expect(solution.processOrder(null, config).ok).toBe(false);
    expect(solution.processOrder({}, config).ok).toBe(false);
  });

  it('collects every item problem, in order', () => {
    const out = solution.processOrder(order([
      { quantity: 0, unitCents: 0 },
    ]), config);
    expect(out.ok).toBe(false);
    expect(out.problems).toEqual([
      'item missing sku', 'quantity must be positive', 'unitCents must be positive',
    ]);
  });

  it('returns no totals when invalid', () => {
    const out = solution.processOrder(order([{ sku: 'x', quantity: -1, unitCents: 5 }]), config);
    expect(out.ok).toBe(false);
    expect(out.totalCents).toBeUndefined();
  });
});

describe('the extracted pieces exist and are pure', () => {
  it('subtotalCents sums quantity * unitCents', () => {
    expect(solution.subtotalCents([])).toBe(0);
    expect(solution.subtotalCents([{ quantity: 2, unitCents: 300 }])).toBe(600);
    expect(solution.subtotalCents([
      { quantity: 2, unitCents: 300 },
      { quantity: 1, unitCents: 99 },
    ])).toBe(699);
  });

  it('subtotalCents does not mutate its input', () => {
    const items = [{ quantity: 2, unitCents: 300 }];
    const before = JSON.stringify(items);
    solution.subtotalCents(items);
    expect(JSON.stringify(items)).toBe(before);
  });

  it('discountCents applies the percentage and the cap', () => {
    expect(solution.discountCents(1000, { discountPercent: 10 })).toBe(100);
    expect(solution.discountCents(1000, {})).toBe(0);
    expect(solution.discountCents(100000, { discountPercent: 10, maxDiscountCents: 2000 })).toBe(2000);
    expect(solution.discountCents(1000, { discountPercent: 10, maxDiscountCents: 2000 })).toBe(100);
  });

  it('discountCents rounds the way the original did', () => {
    // 333 * 10% = 33.3 -> 33
    expect(solution.discountCents(333, { discountPercent: 10 })).toBe(33);
    // 335 * 10% = 33.5 -> 34
    expect(solution.discountCents(335, { discountPercent: 10 })).toBe(34);
  });

  it('shippingCents honours the threshold and the default', () => {
    expect(solution.shippingCents(4999, { shippingCents: 499, freeShippingThresholdCents: 5000 })).toBe(499);
    expect(solution.shippingCents(5000, { shippingCents: 499, freeShippingThresholdCents: 5000 })).toBe(0);
    expect(solution.shippingCents(9999, { shippingCents: 499, freeShippingThresholdCents: 10000 })).toBe(499);
    // The original hardcoded 5000, so that must remain the default.
    expect(solution.shippingCents(5000, { shippingCents: 499 })).toBe(0);
    expect(solution.shippingCents(4999, { shippingCents: 499 })).toBe(499);
  });

  it('shippingCents is 0 when none is configured', () => {
    expect(solution.shippingCents(100, {})).toBe(0);
  });

  it('taxCents applies the percentage to what it is given', () => {
    expect(solution.taxCents(1000, { taxPercent: 20 })).toBe(200);
    expect(solution.taxCents(999, { taxPercent: 20 })).toBe(200);
    expect(solution.taxCents(0, { taxPercent: 20 })).toBe(0);
  });

  it('validateOrder returns an empty array for a valid order', () => {
    expect(solution.validateOrder(order([item()]))).toEqual([]);
  });

  it('validateOrder reports problems without throwing', () => {
    expect(solution.validateOrder(null)).toEqual(['order must have at least one item']);
    expect(solution.validateOrder(order([]))).toEqual(['order must have at least one item']);
    expect(solution.validateOrder(order([{ sku: 'a', quantity: 1, unitCents: -5 }])))
      .toEqual(['unitCents must be positive']);
  });
});

describe('processOrder is now a composition, not a monolith', () => {
  it('delegates to the extracted functions', () => {
    // Every piece is reachable from the module, and processOrder is short.
    const source = solution.processOrder.toString();
    expect(source).toContain('validateOrder');
    expect(source).toContain('subtotalCents');
    expect(source).toContain('discountCents');
    expect(source).toContain('shippingCents');
    expect(source).toContain('taxCents');
  });

  it('no longer contains the duplicated loops or the magic number', () => {
    const source = solution.processOrder.toString();
    expect(source).not.toContain('5000');
    expect(source).not.toContain('for (const item of order.items)');
  });

  it('is short enough to read at a glance', () => {
    const lines = solution.processOrder.toString().split('\\n').filter((l) => l.trim());
    expect(lines.length).toBeLessThan(22);
  });
});`,
        },
      ],
    },

    /* ================================================================== */
    {
      id: 'craft-systems',
      title: 'Systems Thinking',
      summary: 'Caching, observability, scoping work honestly, and running an incident.',
      lessons: [
        {
          id: 'craft-caching',
          title: 'Caching without lying to users',
          kind: 'quiz',
          xp: 70,
          why: 'Caching is the first thing suggested when something is slow, and the first thing to cause a baffling bug.',
          tags: ['caching', 'performance', 'architecture'],
          brief: `A cache trades freshness for speed. Every cache decision is really two:
how stale may this be, and what happens when it is wrong. Skipping the second
question is how you get a user seeing someone else's data.`,
          quiz: [
            {
              q: 'An endpoint is slow. Which should you do before adding a cache?',
              options: [
                'Measure where the time actually goes',
                'Add a Redis layer, then measure the improvement',
                'Increase the instance size',
                'Cache in memory first as it is simpler',
              ],
              answer: [0],
              explain: 'A cache in front of an N+1 query or a missing index hides a problem you could have deleted instead, and it adds an invalidation bug surface forever. Measure first: the fix is often one index or one join.',
            },
            {
              q: 'What is a cache stampede, and what prevents it? Select all the mitigations.',
              options: [
                'When a popular key expires and many concurrent requests all recompute it at once',
                'A lock or single-flight so only one request recomputes while others wait or serve stale',
                'Jittered expiry times, so keys do not all expire together',
                'A longer TTL, which makes the problem disappear',
              ],
              answer: [0, 1, 2],
              explain: 'The first option describes it; the next two are the standard fixes. A longer TTL only makes the stampede rarer and worse when it happens — and staleness is the price. The instinct to reach for a longer TTL is exactly what turns a slow endpoint into a periodic outage.',
            },
            {
              q: 'You cache a user\'s dashboard by URL at the CDN. What is the risk?',
              options: [
                'Serving one user\'s personalised page to another, because the URL is the same and the cache key omits identity',
                'The cache will be too small',
                'CDNs cannot cache HTML',
                'The page will be slower on the first request',
              ],
              answer: [0],
              explain: 'This is the classic and most damaging caching bug. Anything personalised must either not be cached at a shared layer, or be keyed by identity and marked `Cache-Control: private`. Getting it wrong is a data-leak incident, not a performance regression.',
            },
            {
              q: 'Which invalidation strategy is most robust for data that must not appear stale after a write?',
              options: [
                'Write-through or explicit invalidation on write, so the cache is updated or dropped as part of the change',
                'A short TTL and accepting the window',
                'Clearing the whole cache on every deploy',
                'Reading through the cache and hoping the TTL is short enough',
              ],
              answer: [0],
              explain: 'If correctness after a write is required, the write must be responsible for the cache. TTLs are a fine choice when a bounded staleness window is genuinely acceptable — and saying so explicitly is the engineering, rather than picking 60 seconds because it feels safe.',
            },
            {
              q: 'Which of these are reasonable things to cache with a short TTL and little risk? Select all.',
              options: [
                'A public list of product categories that changes weekly',
                'An expensive aggregate report that is recomputed nightly anyway',
                'Feature flag values, with a few seconds of staleness',
                'A user\'s current account balance shown before a payment',
              ],
              answer: [0, 1, 2],
              explain: 'Public, slow-changing, and already-approximate data are ideal. A balance shown immediately before a money decision is not: the cost of being stale is a failed or duplicated payment. The question is always what a wrong answer costs.',
            },
            {
              q: 'What does `Cache-Control: no-store` mean, versus `no-cache`?',
              options: [
                '`no-store` forbids storing the response anywhere; `no-cache` allows storing but requires revalidation before reuse',
                'They are synonyms',
                '`no-cache` forbids caching; `no-store` only applies to disk',
                '`no-store` applies to CDNs only',
              ],
              answer: [0],
              explain: 'The names are genuinely misleading. `no-cache` means "check with me first" — the response may be stored and reused after a successful revalidation. `no-store` means do not write it down at all, which is what you want for sensitive responses.',
            },
          ],
        },
        {
          id: 'craft-observability',
          title: 'Making a service explain itself',
          kind: 'quiz',
          xp: 70,
          why: 'On-call is where you find out whether your logs were written for a human at 3am.',
          tags: ['observability', 'logging', 'operations'],
          brief: `Logs, metrics and traces answer different questions: what happened in this
one request, how is the system behaving in aggregate, and where did the time go
across services. Reaching for the wrong one wastes an outage.`,
          quiz: [
            {
              q: 'Which log line is more useful during an incident?',
              options: [
                '`logger.info({ event: "payment_failed", orderId, userId, provider, status, durationMs }, "payment failed")`',
                '`console.log("payment failed!")`',
                '`console.log("payment failed for " + JSON.stringify(order))`',
                '`logger.error(error)`',
              ],
              answer: [0],
              explain: 'Structured fields are queryable: you can filter by provider, group by status, and correlate by orderId. A prose string is only greppable, and dumping a whole object logs personal data you did not intend to keep and buries the fields you need.',
            },
            {
              q: 'Which of these belong in every request log line? Select all.',
              options: [
                'A request or trace id that ties all lines for one request together',
                'The route, method and status',
                'Duration in milliseconds',
                'The full request body',
              ],
              answer: [0, 1, 2],
              explain: 'Identity, shape and timing let you reconstruct any single request and aggregate across all of them. Full bodies are the fastest route to logging passwords and card numbers, and they blow up your storage bill — log a size, or specific whitelisted fields.',
            },
            {
              q: 'You want to know whether the API is healthy for users. Which metric is most informative?',
              options: [
                'p95 and p99 latency plus error rate, per route',
                'Average latency across all routes',
                'CPU usage',
                'Total request count',
              ],
              answer: [0],
              explain: 'Averages hide the users having a bad time: a p99 of 8 seconds disappears into a 200ms mean. Splitting by route stops a fast health check from masking a slow checkout. CPU is a cause you investigate after you know users are affected.',
            },
            {
              q: 'Why is putting a user id in a metric label a problem?',
              options: [
                'Cardinality: each distinct label value creates a separate time series, and millions of users will overwhelm the metrics backend',
                'It is not allowed by the protocol',
                'Metrics cannot hold strings',
                'It makes dashboards render slowly, but is otherwise fine',
              ],
              answer: [0],
              explain: 'High-cardinality dimensions belong in logs or traces, which are per-event; metrics are pre-aggregated and cost memory per unique label combination. Blowing up cardinality is a common way to take down your own monitoring during the incident you need it for.',
            },
            {
              q: 'A request crosses three services and is slow. Which tool answers "where did the time go?"',
              options: [
                'A distributed trace, showing each span and its duration',
                'The error log',
                'A latency histogram for the entry service',
                'CPU graphs for all three services',
              ],
              answer: [0],
              explain: 'That is exactly what tracing is for: one request, broken into timed spans across service boundaries. Metrics tell you *that* it is slow; the trace tells you *which hop*. Without one you are reduced to correlating timestamps across three log streams.',
            },
            {
              q: 'Which of these should trigger a page (wake someone up)? Select all.',
              options: [
                'Checkout error rate above 5% for five minutes',
                'The service is returning 503 to all requests',
                'A single caught-and-handled 500 in a background job',
                'Disk 80% full and rising at a rate that hits 100% in two hours',
              ],
              answer: [0, 1, 3],
              explain: 'Page on user-visible impact or on a trajectory that becomes impact soon. A single handled error is a ticket, not an alarm. Alerting on everything trains people to ignore the pager, which is worse than not alerting at all.',
            },
            {
              q: 'What is the most useful thing to add to a log line for a caught exception?',
              options: [
                'The error message, its type, the stack, and the context needed to reproduce it (ids, inputs, which branch)',
                'The error message only',
                'A note that it was handled',
                'The full environment variables, for completeness',
              ],
              answer: [0],
              explain: 'Type and stack tell you what and where; the ids and inputs tell you which case, so you can reproduce it without guessing. Environment variables are how secrets end up in your log aggregator, permanently.',
            },
          ],
        },
        {
          id: 'craft-scoping',
          title: 'Scoping and estimating honestly',
          kind: 'quiz',
          xp: 70,
          why: 'Mid-level means being handed a vague problem instead of a defined task. How you break it down is the job.',
          tags: ['planning', 'estimation', 'communication'],
          brief: `A junior is given a task. A mid-level engineer is given a problem and is
expected to return a plan, the risks, and what they would cut. Estimates are
not promises — they are communication about uncertainty, and hiding the
uncertainty is what makes them useless.`,
          quiz: [
            {
              q: 'You are asked "how long will the notifications feature take?" and you genuinely do not know. Best answer?',
              options: [
                'Two weeks (pick something plausible so you are not blocking)',
                'Name the unknowns, give a range with the assumptions behind it, and offer a short spike to shrink the range',
                'I cannot estimate this',
                'Whatever you need it to be',
              ],
              answer: [1],
              explain: 'A range plus assumptions is an honest, actionable answer: it tells the asker what would make it faster and what could make it slower. A confident single number invented to avoid the conversation is the root of most missed deadlines.',
            },
            {
              q: 'Which of these are good ways to break down a two-week feature? Select all.',
              options: [
                'Vertical slices that each deliver something demonstrable end to end',
                'Riskiest or most uncertain part first',
                'A slice that can ship behind a feature flag without the rest being finished',
                'All the backend first, then all the frontend, then integrate',
              ],
              answer: [0, 1, 2],
              explain: 'Vertical slices give you feedback and a shippable increment at every step. Front-loading risk means you learn the bad news in week one rather than week two. Horizontal layers hide integration problems until the end, which is precisely when there is no time left.',
            },
            {
              q: 'Halfway through, you discover the approach will not work and needs a different design costing another week. What do you do?',
              options: [
                'Tell your lead now, with the options and what you would recommend',
                'Work extra hours to hide the slip',
                'Ship the broken approach and fix it later',
                'Wait for the next stand-up in case you find a shortcut',
              ],
              answer: [0],
              explain: 'Bad news early is cheap; bad news late is expensive, because the options shrink with the remaining time. Coming with options and a recommendation is what makes it a professional escalation rather than a problem handed over.',
            },
            {
              q: 'The deadline is fixed and the scope will not fit. Which are legitimate levers? Select all.',
              options: [
                'Cut scope: ship the core case and defer the edge cases explicitly',
                'Reduce quality of things that are cheap to redo, deliberately and visibly',
                'Add people to the task in the final week',
                'Ship behind a flag to a subset of users',
              ],
              answer: [0, 1, 3],
              explain: 'Scope, deliberate and recorded quality trade-offs, and staged rollout are all real. Adding people late usually slows things down — onboarding cost lands exactly when you have least slack. Saying which of these you are pulling, out loud, is the difference between a plan and a hope.',
            },
            {
              q: 'Why do estimates so consistently come in low?',
              options: [
                'We estimate the happy path and forget review, testing, deployment, edge cases, meetings and the other work already on our plate',
                'Engineers are optimists by nature',
                'Managers pressure us into low numbers',
                'The work genuinely changes scope every time',
              ],
              answer: [0],
              explain: 'The coding is the part we can picture, so it is the part we cost. Everything around it — review latency, the test that turns out to be flaky, the migration, the two meetings, the interrupt from on-call — is real work that was never in the number. Estimating the whole path to production, not the coding, is what makes an estimate land.',
            },
            {
              q: 'A ticket says "make the dashboard faster". What is the first thing to do?',
              options: [
                'Ask what "faster" means and for whom: which view, which measure, what target, and what problem prompted it',
                'Add caching everywhere',
                'Profile and start optimising the slowest thing you find',
                'Estimate three days and begin',
              ],
              answer: [0],
              explain: 'Without a definition of done you cannot know when to stop, or whether you fixed the thing the reporter cared about. "The team lead\'s 8,000-row view takes 30 seconds and should take under 3" is a task; "make it faster" is a feeling. Profiling comes second, once you know which number you are moving.',
            },
          ],
        },
        {
          id: 'craft-incident',
          title: 'BOSS: the 3am page',
          kind: 'quiz',
          xp: 200,
          boss: true,
          why: 'Incident response is where every skill in this track gets tested at once, under time pressure, with people watching.',
          tags: ['incidents', 'operations', 'debugging', 'communication'],
          brief: `It is 03:07. You are on call. The page says:

> **checkout_error_rate > 20% for 5m**

The dashboard shows checkout 5xx climbing from near zero at 02:50. Other
endpoints look normal. There was a deploy at 02:45.

Work through it in order. This is graded as one scenario — every answer must be
right, and the sequence is the point: **stop the bleeding, then diagnose, then
prevent**.`,
          quiz: [
            {
              q: 'Step 1, 03:08. What do you do first?',
              options: [
                'Start reading the deploy diff to find the bug',
                'Roll back the 02:45 deploy — it is the obvious suspect and rollback is fast and reversible',
                'Scale up the service in case it is load',
                'Wait ten minutes to see whether it recovers on its own',
              ],
              answer: [1],
              explain: 'Mitigate before you understand. A deploy immediately before the onset is the highest-prior suspect, and a rollback is the cheapest reversible action available. Reading the diff is diagnosis — valuable, but it does not stop customers failing to check out. If rollback does not help, you have also learned something important.',
            },
            {
              q: 'Step 2, 03:09. Before or while rolling back, what else must happen?',
              options: [
                'Nothing until you know the cause — announcing early causes panic',
                'Post in the incident channel: what is broken, the impact, that you are rolling back, and when you will next update',
                'Email the whole company',
                'Open a ticket for the bug',
              ],
              answer: [1],
              explain: 'Communicate immediately and on a cadence. Others may be seeing symptoms, someone may know about a change you do not, and support needs to answer customers. A short "what, impact, action, next update in 15 minutes" costs nothing and prevents three people independently investigating.',
            },
            {
              q: 'Step 3, 03:14. The rollback finished and the error rate is falling. Are you done?',
              options: [
                'Yes, go back to sleep',
                'No — confirm recovery with the metric, check whether anything needs repairing (stuck orders, queued jobs), then hand over or write up',
                'No — immediately deploy a forward fix so it is not blocked tomorrow',
                'Yes, once you post that it is resolved',
              ],
              answer: [1],
              explain: 'Mitigation is not the end. Verify with the same signal that alerted you, then look for damage the failure left: half-completed checkouts, retries piling up, a dead-letter queue. Writing a forward fix at 03:14 with no sleep is how the second incident starts.',
            },
            {
              q: 'Step 4, 03:20. You look at the diff. It added a call to a new pricing service inside the checkout path, with no timeout. What was the actual failure mode?',
              options: [
                'The pricing service was slow or down, so checkout requests hung and exhausted the connection pool or request handlers',
                'The new code had a syntax error',
                'The deploy corrupted the database',
                'Checkout ran out of memory because of the extra object',
              ],
              answer: [0],
              explain: 'A dependency with no timeout converts someone else\'s latency into your outage. Requests pile up waiting, the pool or worker count saturates, and requests that never touch pricing start failing too. This is the single most common cause of a cascading failure in a service-oriented system.',
            },
            {
              q: 'Step 5. Which of these belong in the forward fix? Select all.',
              options: [
                'An aggressive timeout on the pricing call',
                'A fallback: proceed with the last known price, or fail that one feature rather than all of checkout',
                'A circuit breaker so a sustained failure stops being retried',
                'A retry loop with no limit, so it eventually succeeds',
              ],
              answer: [0, 1, 2],
              explain: 'Timeout, fallback and circuit breaker are the standard trio: bound the wait, degrade gracefully, and stop hammering something that is already down. An unbounded retry loop makes it worse — you turn a partial outage into a self-inflicted denial of service against your own dependency.',
            },
            {
              q: 'Step 6. The alert fired after five minutes at over 20%. What does that suggest about your monitoring?',
              options: [
                'It worked, but consider whether a tighter threshold or shorter window would have caught it sooner, weighed against false pages',
                'It is fine as is — never touch a working alert',
                'Alert on any single 5xx instead',
                'Remove the alert; the rollback was quick anyway',
              ],
              answer: [0],
              explain: 'The honest answer is a trade-off, not a fix. Faster detection means more false pages, and a pager that cries wolf gets ignored. What is often more valuable than a tighter threshold is a *better* signal — alerting on the dependency\'s latency, or on saturation of the request pool, would have caught the cause rather than the symptom.',
            },
            {
              q: 'Step 7. The postmortem. Which statements make it a useful one? Select all.',
              options: [
                'A timeline with timestamps: onset, detection, mitigation, resolution',
                'Blameless framing: how the system allowed the change to cause an outage, not who wrote it',
                'Specific, owned, scheduled action items',
                'A conclusion that the engineer should have been more careful',
              ],
              answer: [0, 1, 2],
              explain: 'Timeline, blameless analysis, and concrete owned actions are what turn an outage into an improvement. "Be more careful" is not an action item — it cannot be verified and changes nothing. The useful version is: default timeouts in the HTTP client, a review checklist item for new synchronous dependencies, an alert on pool saturation.',
            },
            {
              q: 'Final question. What was the deeper organisational cause here?',
              options: [
                'A new synchronous dependency was added to the most critical path with no timeout, and nothing in review, tooling or defaults caught it',
                'The pricing service team shipped a bug',
                'The deploy happened too late at night',
                'The on-call engineer was too slow',
              ],
              answer: [0],
              explain: 'The pricing service will fail again — dependencies do. Blaming its team, the deploy window, or the responder all fail to explain why one dependency failing could take out checkout. The fix is in defaults and guardrails: a client whose timeout is mandatory, and a review habit that treats "new call in the checkout path" as a design question.',
            },
          ],
        },
      ],
    },
  ],
});

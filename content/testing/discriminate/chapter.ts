import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'testing-discriminate',
  title: 'Tests that discriminate',
  summary: 'A test is worth something only if it fails when the code is wrong. Choose inputs that expose bugs, and pin behaviour before you refactor.',
  lessons: [
    {
      id: 'test-strategy',
      title: 'What to test where',
      kind: 'quiz',
      xp: 70,
      why: 'Choosing which layer a test belongs in decides whether your suite catches regressions or just slows the pipeline down.',
      tags: ['testing strategy', 'integration tests', 'flaky tests', 'ci'],
      quiz: [
        {
          q: '`createOrder` validates input, reserves stock through an HTTP inventory service, and inserts rows into Postgres in a transaction. Last month a column rename broke the insert. Every unit test still passed, because the repository was mocked. Which test gives the most confidence for the least upkeep?',
          options: [
            'More unit tests, asserting on the exact SQL string the mocked repository receives',
            'An end-to-end browser test that places an order through the UI',
            'An integration test that runs the real service against a throwaway Postgres with the real schema, faking only the inventory HTTP API at its boundary',
            'A contract test asserting that the service calls the repository interface with the right arguments',
          ],
          answer: [2],
          explain: 'The bug lived where your code meets the database, so only a test that crosses that boundary can see it. A real Postgres (a container, or PGlite as in this app) runs the actual schema and the actual query, and it is still fast and deterministic. Asserting on the SQL string pins the implementation: it fails when someone reformats the query and passes when the column is renamed under it. The contract test checks the wrong interface, because the repository signature never changed. An end-to-end test would catch it, but slowly, with more flake, and far from the cause. Fake the thing you do not control (the inventory service) and run the thing you do (your schema and queries).',
        },
        {
          q: 'You are adding tests to a React + Node product that has very few. Which plan matches the "testing trophy" argument?',
          options: [
            'Static checks (types, lint) as the base; most effort in integration tests that drive several units through their public interface; unit tests for tricky pure logic; a few end-to-end tests for the critical journeys',
            'Mostly isolated unit tests with every collaborator mocked, some integration tests, and a handful of end-to-end tests',
            'Mostly end-to-end tests, because they are the only ones that test what users actually do',
            'Roughly equal numbers at every level, so that no layer is left uncovered',
          ],
          answer: [0],
          explain: 'The classic pyramid (mostly isolated unit tests) came from a time when integration tests were slow and brittle. The trophy argues that, with in-memory databases, jsdom and Testing Library, tests that exercise real collaborators are now cheap. They also catch the bugs that actually ship, which sit in the wiring between units. Unit tests still earn their place for dense pure logic (pricing, parsing, date maths). Mostly end-to-end means a slow, flaky suite, and a red run tells you something is wrong but not where. Equal numbers per level is a quota, not a strategy. The question to ask of any test is what it would catch, and how cheaply.',
        },
        {
          q: 'The only test in a new PR is `expect(render(<Checkout />).container).toMatchSnapshot()`, which records a 400-line snapshot. What are the real problems with it? (Select all that apply.)',
          options: [
            'Snapshots are too slow to run in CI',
            'It does not say what correct looks like: a bug that exists when the snapshot is recorded is saved as the expected output',
            'Snapshot files cannot be reviewed in a pull request, so nobody ever sees them',
            'Any markup change fails it, including harmless ones, so people learn to run `-u` and approve the diff without reading it. After that it catches nothing',
          ],
          answer: [1, 3],
          explain: 'A snapshot is an assertion that *nothing* changed, so it has no idea which change matters. On a big render tree every refactor turns it red, and every `-u` teaches the team to ignore it. A good test states the behaviour: "the total shows £12.50", "Pay is disabled until the form is valid". Snapshot diffs do show up in review, and they are fast, but a 400-line diff gets skimmed. Snapshots are fine for small, stable, serialised output that a human reads closely, such as a generated migration or an error message.',
        },
        {
          q: 'A module reports **100 % line and branch coverage**. A mutation-testing run against it kills **0 of 12** mutants. What is the most likely explanation?',
          options: [
            'The mutation tool is misconfigured: 100 % branch coverage means every branch outcome was verified',
            'All 12 are equivalent mutants that behave identically, so they can be ignored',
            'Coverage was collected on a different build than the one the mutants were made from',
            'The tests run the code but check little or nothing about its results, e.g. `expect(() => fn(x)).not.toThrow()` or only asserting that a mock was called',
          ],
          answer: [3],
          explain: 'Coverage counts lines that *ran*. Mutation testing counts lines whose behaviour was *checked*. A test that calls `calculateTotal(cart)` and asserts nothing covers every line of it. Equivalent mutants exist, but twelve of them in a row does not happen. This is exactly the gap this track grades you on: every test must fail when the code is wrong. Use coverage to find code no test touches, and mutation score, or review, to judge whether the tests are any good.',
        },
        {
          q: 'An end-to-end checkout test fails about 1 run in 20 on `main` and blocks merges in the middle of a release week. What should you do?',
          options: [
            'Set `retries: 3` on the whole suite so the pipeline goes green',
            'Delete the test: a flaky test is worse than no test',
            'Quarantine it: take it out of the blocking gate but keep running and reporting it, open a ticket with an owner and a date, and look for the cause (a wait on a timer instead of a condition, shared state between tests, order dependence)',
            'Double every timeout and wait in the test',
          ],
          answer: [2],
          explain: 'Quarantine protects everyone\'s merges without throwing away the signal. Suite-wide retries hide flakiness everywhere, including a real race in checkout that customers will hit 1 time in 20. Deleting the test loses coverage of your most valuable journey. Longer timeouts make the suite slower and only push the race further out. Most flakes come from waiting on time instead of on a condition (`waitFor(() => …)`), from tests leaking state into each other, or from depending on order. A quarantine without an owner and a deadline is just deleting the test slowly.',
        },
        {
          q: 'Which checks belong in a **pre-commit** hook, and not only in CI? (Select all that apply.)',
          options: [
            'Formatting and lint on the staged files',
            'A secret scanner over the staged diff',
            'The full integration suite against Postgres',
            'None: hooks can be skipped with `--no-verify`, so only CI counts',
          ],
          answer: [0, 1],
          explain: 'A pre-commit hook has to finish in seconds or people will bypass it. Formatting and lint on staged files are fast, and they keep review from filling up with noise. A secret scanner belongs there because pushing is already too late: once a key is in shared history it must be rotated, even if the commit is reverted. The integration suite is too slow for every commit, so run it in CI (and a pre-push hook if you like). It is true that hooks can be skipped, which is why CI stays the authority and re-runs everything. But fast local feedback is still worth having.',
        },
        {
          q: 'Your service charges cards through the Stripe SDK. How should you test the logic that decides whether to retry a failed charge?',
          options: [
            'Mock the Stripe SDK module in every test and stub `stripe.paymentIntents.create` to return or throw what each case needs',
            'Wrap Stripe in a thin adapter you own that returns your own result type. Unit-test the retry logic against a fake of that adapter, and cover the adapter with a few integration tests against Stripe\'s test mode',
            'Run every test against Stripe\'s test mode, because only the real API is trustworthy',
            'Skip it: Stripe\'s idempotency keys make retries safe, so there is nothing to test',
          ],
          answer: [1],
          explain: '"Don\'t mock what you don\'t own." If you mock the SDK directly, your tests only know what *you believe* Stripe returns, and every call site is tied to its shape, so an SDK upgrade breaks dozens of tests while real behaviour goes untested. An adapter gives you one narrow interface. Its fake is simple and honest, and a handful of tests against the real sandbox check the adapter itself. Running everything against test mode is slow and rate-limited, and it cannot easily produce the failures (timeouts, 5xx) that retry logic exists for. Idempotency makes a retry *safe*. It does not decide *whether* to retry.',
        },
      ],
    },
    {
      id: 'test-discriminating',
      title: 'Tests that actually catch bugs',
      kind: 'mutation',
      xp: 90,
      minTests: 6,
      why: 'A green suite that lets bugs through is worse than no suite, because everyone trusts it. Picking inputs that expose bugs is what makes a test useful.',
      tags: ['mutation testing', 'test design', 'edge cases'],
      mutants: [
        { slug: 'no-trim', label: 'Leaves a dash at the start or end (never trims)' },
        { slug: 'keeps-double-dash', label: 'Turns each separator character into its own dash ("a--b")' },
        { slug: 'no-lowercase', label: 'Keeps uppercase letters' },
        { slug: 'truncate-mid-word', label: 'Truncates in the middle of a word' },
        { slug: 'no-unicode-fold', label: 'Drops accented letters instead of folding them ("café" → "caf")' },
        { slug: 'empty-returns-undefined', label: 'Returns undefined for a blank title' },
      ],
      hints: [
        'Take the bullets in the brief one at a time. For each, ask what input would come out *differently* if that rule were broken. `"hello"` says nothing about trimming, collapsing or truncation.',
        'Separators: use a run of two or more non-letters (`"rock  &  roll"`). Trimming: put spaces or punctuation at both ends. Accents: `"Café"`. Case: any capital letter.',
        'Truncation needs a `maxLength` that lands *inside* a word: `slugify("one two three", { maxLength: 9 })` must be `"one-two"`. Also check a single word longer than the limit.',
        'Blank input: assert `toBe("")` for `""` and for `"   "`. `toBeFalsy()` would also accept `undefined`, and that is one of the planted bugs.',
      ],
    },
    {
      id: 'test-characterization',
      title: 'Pin behaviour before you refactor',
      kind: 'mutation',
      xp: 100,
      minTests: 6,
      why: 'Refactoring without tests is rewriting and hoping. Characterisation tests are how you safely change code you did not write and do not fully trust.',
      tags: ['characterisation tests', 'refactoring', 'legacy code'],
      mutants: [
        { slug: 'round-moved', label: 'Rounds once at the end instead of rounding the discount (fractional discountCents)' },
        { slug: 'threshold-on-raw-subtotal', label: 'Decides free shipping on the subtotal before the discount' },
        { slug: 'discount-cap-off', label: 'Treats maxDiscountCents as a minimum discount instead of a cap' },
        { slug: 'problem-order-changed', label: 'Lists problems rule by rule instead of item by item' },
        { slug: 'validation-short-circuits', label: 'Stops at the first problem instead of reporting all of them' },
      ],
      hints: [
        'Assert on the whole returned object with `toEqual` (or the fields you care about with `toMatchObject`). Checking only `ok` or `totalCents` lets a lot through.',
        'Rounding: use an amount whose discount is fractional, e.g. `999` cents at 10 % (99.9 → 100). Free shipping: an order over `5000` before the discount but under it after, e.g. `5200` at 10 % off.',
        'The cap needs two tests: one where the raw discount is above `maxDiscountCents` (it gets capped), and one where it is below (it is left alone).',
        'Validation: one item with all three problems pins the order within an item. Two items with *different* problems pins the order across items: `[item("A", 0, 100), item("", 1, 100)]` must give `["quantity must be positive", "item missing sku"]`.',
      ],
    },
  ],
});

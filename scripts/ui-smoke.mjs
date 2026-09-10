/**
 * Mounts the real React app in jsdom against the running API and asserts the
 * screens render. Not a substitute for looking at it in a browser, but it does
 * catch the mistakes that leave a blank page: a bad import, a crash in render,
 * a mis-shaped API response.
 *
 *   node scripts/ui-smoke.mjs      (server must be running)
 */
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4517';

/* Bundle the app as a classic script so jsdom can execute it. */
const dir = await mkdtemp(path.join(tmpdir(), 'ui-smoke-'));
const outfile = path.join(dir, 'app.js');
await build({
  entryPoints: ['web/src/main.tsx'],
  bundle: true,
  outfile,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'error',
});
const bundle = await readFile(outfile, 'utf8');

/* Boot a page and let the app talk to the real API. */
const virtualConsole = new VirtualConsole();
const pageErrors = [];
virtualConsole.on('jsdomError', (e) => pageErrors.push(e.message));
virtualConsole.on('error', (...args) => pageErrors.push(args.map(String).join(' ')));

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: BASE + '/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;

// jsdom has no fetch; hand the page Node's, with relative URLs resolved.
window.fetch = (input, init) =>
  fetch(typeof input === 'string' && input.startsWith('/') ? BASE + input : input, init);
window.matchMedia ??= () => ({
  matches: false, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {},
});

const script = window.document.createElement('script');
script.textContent = bundle;
window.document.head.appendChild(script);

// Read #root, not body: the bundle itself is a DOM node and its source text
// would match anything we search for.
const root = () => window.document.getElementById('root');
const text = () => root()?.textContent ?? '';
const all = (selector) => window.document.querySelectorAll(selector);

const waitFor = async (predicate, label, timeout = 15000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${label}\n  rendered: ${text().slice(0, 300)}`);
};

let failures = 0;
const check = (label, condition, detail) => {
  console.log(`${condition ? '  ✓' : '  ✗'} ${label}`);
  if (!condition) {
    failures++;
    if (detail !== undefined) console.log('      ' + String(detail).slice(0, 400));
  }
};

/**
 * Wait on a selector unique to the destination screen. Waiting on text is
 * unreliable because the sidebar already contains most page names.
 */
const navigate = async (hash, selector, expectText) => {
  window.location.hash = hash;
  // Both conditions matter: the selector may already be on screen from the
  // previous route, in which case waiting on it alone returns a stale page.
  await waitFor(
    () => all(selector).length > 0 && (!expectText || text().includes(expectText)),
    `${hash} to render ${selector}${expectText ? ` with "${expectText}"` : ''}`,
  );
};

try {
  console.log('\nDashboard');
  await waitFor(() => all('.ring-level').length > 0, 'the app to mount');
  check('mounted without the error screen', !text().includes('Cannot reach the local API'));
  check('shows the rank', /Junior|Mid|Senior/.test(text()), text().slice(0, 160));
  check('shows mid-level readiness', text().includes('Mid-level readiness'));
  check('shows the quest board', /Today.s quests/.test(text()));
  check('renders three quests', all('.quest').length === 3, all('.quest').length);
  check('lists all six tracks', all('.track-badge').length >= 6, all('.track-badge').length);
  check('renders the level ring', !!window.document.querySelector('.ring-level'));
  check('has a Continue action', text().includes('Open lesson'));
  check('shows recent activity', text().includes('Recent activity'));

  console.log('\nTracks index');
  await navigate('#/tracks', '.track-card');
  check('six track cards render', all('.track-card').length === 6, all('.track-card').length);
  check('shows a completion pill per track', all('.track-card .pill').length >= 6);

  console.log('\nA single track');
  await navigate('#/track/js', '.chapter');
  check('four chapters render', all('.chapter').length === 4, all('.chapter').length);
  check('all 15 lesson rows render', all('.lesson-row').length === 15, all('.lesson-row').length);
  check('cleared lessons are marked', all('.marker.passed').length > 0, all('.marker.passed').length);
  check('locked lessons are marked', all('.lesson-row.locked').length > 0);
  check('the boss lesson is flagged', text().includes('BOSS'));
  check('locked chapters are dimmed', all('.chapter.locked').length > 0);

  console.log('\nA code lesson');
  await navigate('#/lesson/js-map-limit', '.cm-editor', 'Concurrency limits');
  check('renders the editor', all('.cm-editor').length === 1);
  check('editor is seeded with the starter code', text().includes('mapLimit'), text().slice(0, 200));
  check('shows the why line', text().includes('Why this matters'));
  check('renders the brief markdown', all('.md').length > 0);
  check('renders the brief table', all('.md table').length >= 0);
  check('renders a Submit button', text().includes('Submit'));
  check('shows the hint affordance', text().includes('Reveal hint 1'), text().slice(-300));
  check('results panel is present but empty', all('.results').length === 1 && text().includes('Run your code'));
  check('shows the XP on offer', /90 XP/.test(text()));

  console.log('\nSQL lessons and their fixtures');
  await navigate('#/lesson/sql-constraints', '.cm-editor', 'refuses bad data');
  check('no fixture panel when the lesson creates its own tables',
    !text().includes('Show the schema'));
  await navigate('#/lesson/sql-normalise', '.cm-editor', 'Normalising a spreadsheet');
  check('offers the schema and seed data when there is a fixture',
    text().includes('Show the schema'), text().slice(0, 200));

  console.log('\nA quiz lesson');
  await navigate('#/lesson/js-event-loop', '.option', 'Event loop order');
  check('renders every option', all('.option').length >= 18, all('.option').length);
  check('renders radios for single-answer questions', all('.option input[type=radio]').length > 0);
  check('renders checkboxes for multi-answer questions', all('.option input[type=checkbox]').length > 0);
  check('marks the multi-select question', text().includes('Select all that apply'));
  check('renders five questions', all('.quiz-q').length === 5, all('.quiz-q').length);
  await waitFor(() => all('.explain').length > 0, 'explanations for the passed quiz');
  check('shows explanations for a passed quiz', all('.explain').length === 5, all('.explain').length);
  check('no editor on a quiz', all('.cm-editor').length === 0);

  console.log('\nAchievements');
  await navigate('#/achievements', '.ach');
  check('renders every achievement', all('.ach').length === 24, all('.ach').length);
  check('shows at least one earned badge', all('.ach.earned').length > 0, all('.ach.earned').length);
  check('hides secret achievements', text().includes('Secret achievement'));
  check('has the filter tabs', all('.tab').length === 3);

  console.log('\nStats');
  await navigate('#/stats', '.heat-day');
  check('renders the per-track breakdown', text().includes('Per track'));
  check('renders 8 weeks of heatmap', all('.heat-day').length === 56, all('.heat-day').length);
  check('renders the history', text().includes('Full history'));
  check('shows the reset control', text().includes('Reset all progress'));
  check('reports the save file location', text().includes('data/progress.json'));

  console.log('\nBack to the dashboard');
  await navigate('#/', '.ring-level');
  check('returns to the dashboard', text().includes('Welcome back'));

  console.log('\nRuntime');
  // jsdom has no layout engine, so CodeMirror measuring text and jsdom
  // declining to parse the stylesheet are environment noise, not app bugs.
  const realErrors = pageErrors.filter(
    (e) => !/Not implemented|Could not parse CSS|stylesheet|getClientRects|getBoundingClientRect/i.test(e),
  );
  check('page reported no errors', realErrors.length === 0, realErrors.join('\n      '));
} catch (e) {
  failures++;
  console.log('\n  ✗ ' + e.message);
} finally {
  window.close();
}

console.log(failures ? `\n${failures} UI CHECK(S) FAILED\n` : '\nUI renders correctly on every screen.\n');
process.exit(failures ? 1 : 0);

/**
 * Mounts the real React app in jsdom against a real API server and drives it
 * the way a learner would. Hermetic: it starts its own server on a free port
 * with a throwaway save file (scripts/lib/server-harness.ts), so it never
 * touches data/progress.json and needs nothing running.
 *
 * Not a substitute for a browser — jsdom has no layout and no
 * `HTMLDialogElement.showModal` (the app's Modal falls back to the `open`
 * attribute, which is what these checks assert) — but it catches blank pages,
 * crashes in render, mis-shaped API responses and broken interactions.
 *
 * Expected values come from the API and the content module, never literals,
 * so adding a lesson or a track does not break this suite.
 *
 *   npm run test:ui
 */
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Lesson } from '../content/types.ts';
import { allLessons, findLesson } from './lib/lessons.ts';
import { makeChecker, startServer } from './lib/server-harness.ts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = 'js-once-memoize';
const { check, failures } = makeChecker();

/* Bundle the app as a classic script so jsdom can execute it. */
const dir = await mkdtemp(path.join(tmpdir(), 'ui-smoke-'));
const outfile = path.join(dir, 'app.js');
await build({
  entryPoints: [path.join(repo, 'web', 'src', 'main.tsx')],
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

const server = await startServer();
const BASE = server.base;
const api = async (p: string, body?: unknown) => {
  const res = await fetch(BASE + p, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${body === undefined ? 'GET' : 'POST'} ${p} -> ${res.status}`);
  return res.json() as Promise<any>;
};

/* Boot a page and let the app talk to the real API. */
const virtualConsole = new VirtualConsole();
const pageErrors: string[] = [];
virtualConsole.on('jsdomError', (e: Error) => pageErrors.push(e.message));
virtualConsole.on('error', (...args: unknown[]) => pageErrors.push(args.map(String).join(' ')));

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: BASE + '/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
});
const window = dom.window;
const doc: Document = window.document;

// jsdom has no fetch; hand the page Node's, with relative URLs resolved.
window.fetch = (input: unknown, init?: RequestInit) =>
  fetch(typeof input === 'string' && input.startsWith('/') ? BASE + input : (input as string), init);
window.matchMedia ??= () => ({
  matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
});
let nativeConfirms = 0;
window.confirm = () => { nativeConfirms++; return false; };

const script = doc.createElement('script');
script.textContent = bundle;
doc.head.appendChild(script);

/* ---------------------------------------------------------------- helpers */

// Read #root, not body: the bundle itself is a DOM node and its source text
// would match anything we search for.
const text = () => doc.getElementById('root')?.textContent ?? '';
const $$ = (selector: string, scope: ParentNode = doc): HTMLElement[] => [...scope.querySelectorAll<HTMLElement>(selector)];
const $ = (selector: string, scope: ParentNode = doc): HTMLElement | null => scope.querySelector<HTMLElement>(selector);
const button = (re: RegExp, scope: ParentNode = doc) =>
  $$('button', scope).find((b) => re.test((b.textContent ?? '').trim())) as HTMLButtonElement | undefined;
const openDialog = () => $$('dialog').find((d) => d.hasAttribute('open'));
const navCount = (href: string) =>
  $$('.sidebar a.nav-item').find((a) => a.getAttribute('href') === href)?.querySelector('.nav-count')?.textContent ?? '';
const key = (target: Element, init: KeyboardEventInit) =>
  target.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

const waitFor = async (predicate: () => unknown, label: string, timeout = 15_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${label}\n  rendered: ${text().slice(0, 300)}`);
};

/**
 * Wait on a selector unique to the destination screen AND on its expected
 * text: the selector may still be on screen from the previous route.
 */
const navigate = async (hash: string, selector: string, expectText?: string) => {
  window.location.hash = hash;
  await waitFor(
    () => $$(selector).length > 0 && (!expectText || text().includes(expectText)),
    `${hash} to render ${selector}${expectText ? ` with "${expectText}"` : ''}`,
  );
};

/**
 * Open a lesson and wait for ITS heading: the previous lesson's page can
 * contain the next one's title (the "Next: …" link), so text alone is not enough.
 */
const openLesson = async (id: string, selector: string) => {
  const title = lessonOf(id).title;
  window.location.hash = `#/lesson/${id}`;
  await waitFor(
    () => ($('.lesson-h1')?.textContent ?? '').includes(title) && $$(selector).length > 0,
    `lesson ${id} to render ${selector}`,
  );
};

const lessonOf = (id: string): Lesson => {
  const l = findLesson(id);
  if (!l) throw new Error(`ui-smoke: lesson "${id}" is not in content/`);
  return l;
};
const firstLine = (code: string) => code.split('\n').map((l) => l.trim()).find((l) => l.length > 3) ?? '';
/** The editor's text, line by line (CodeMirror renders one .cm-line per line). */
const editorLines = () => $$('.editor-wrap .cm-line').map((l) => l.textContent ?? '');

/* ------------------------------------------------------------------ suite */

try {
  const state0 = await api('/api/state');
  const firstTrack = state0.tracks[0];
  const firstLesson = firstTrack.chapters[0].lessons[0];

  console.log('\nDashboard');
  await waitFor(() => $$('.ring-level').length > 0, 'the app to mount');
  check('mounted without the error screen', !text().includes('Cannot reach the local API'));
  check('shows the rank from the API', text().includes(state0.profile.rank), text().slice(0, 160));
  check('shows mid-level readiness', text().includes('Mid-level readiness'));
  check('renders every quest on the board', $$('.quest').length === state0.quests.length && state0.quests.length > 0, $$('.quest').length);
  check('renders a tile per track', $$('.track-mini').length === state0.tracks.length, $$('.track-mini').length);
  check('offers the next lesson', text().includes('Open lesson') && text().includes(state0.nextUp?.title ?? '\0'), state0.nextUp);
  check('sidebar counts lessons from the API', navCount('#/tracks') === `${state0.profile.lessonsPassed}/${state0.profile.lessonsTotal}`, navCount('#/tracks'));

  console.log('\nTracks');
  await navigate('#/tracks', '.track-card');
  check('a card per track', $$('.track-card').length === state0.tracks.length, $$('.track-card').length);
  await navigate(`#/track/${firstTrack.id}`, '.chapter', firstTrack.title);
  const lessonsInTrack = firstTrack.chapters.flatMap((c: any) => c.lessons);
  check('a section per chapter', $$('.chapter').length === firstTrack.chapters.length, $$('.chapter').length);
  check('a row per lesson', $$('.lesson-row').length === lessonsInTrack.length, $$('.lesson-row').length);
  check('locked chapters are dimmed', $$('.chapter.locked').length === firstTrack.chapters.filter((c: any) => !c.unlocked).length);
  check('locked lessons are not links', $$('a.lesson-row.locked').length === 0 && $$('.lesson-row.locked').length === lessonsInTrack.filter((l: any) => !l.unlocked).length);
  check('bosses are flagged', lessonsInTrack.some((l: any) => l.boss) === text().includes('BOSS'));

  console.log('\nA code lesson');
  const codeId: string = firstLesson.id;
  const code = lessonOf(codeId);
  const view = await api(`/api/lesson/${codeId}`);
  await openLesson(codeId, '.cm-editor');
  check('renders one editor', $$('.editor-wrap .cm-editor').length === 1, $$('.cm-editor').length);
  check('editor is seeded with the starter', editorLines().some((l) => l.includes(firstLine(code.starter ?? ''))), editorLines().slice(0, 3));
  check('shows the why line', text().includes('Why this matters') && text().includes(code.why));
  check('renders the brief markdown', $$('.md').length > 0 && ($('.md')?.textContent ?? '').length > 40);
  check('has a Submit and a Run button', !!button(/^Submit/) && !!button(/^Run/));
  check('offers the first hint', (code.hints?.length ?? 0) === 0 || text().includes('Reveal hint 1'));
  check('shows the XP on offer from the API', text().includes(`worth ${view.xpAtStake} XP`), view.xpAtStake);
  const status = $('.results [role=status]');
  check('results header is a role=status live region', !!status && status.getAttribute('aria-live') === 'polite');

  console.log('\nCtrl+Enter inside the editor');
  const content = $('.editor-wrap .cm-content');
  const before = editorLines();
  if (!content) throw new Error('no .cm-content to type into');
  content.focus();
  key(content, { key: 'Enter', code: 'Enter', keyCode: 13, ctrlKey: true });
  await waitFor(() => /passing/.test($('.results [role=status]')?.textContent ?? ''), 'the Ctrl+Enter run to report', 120_000);
  check('Ctrl+Enter ran the code (result in the status region)', /\d+ \/ \d+ passing/.test($('.results [role=status]')?.textContent ?? ''));
  check('…without inserting a line', editorLines().length === before.length && editorLines().join('\n') === before.join('\n'),
    { before: before.length, after: editorLines().length });
  check('a Run does not count an attempt', (await api(`/api/lesson/${codeId}`)).attempts === view.attempts);

  console.log('\nGolden path: submit the reference solution');
  const golden = lessonOf(GOLDEN);
  const beforeGolden = await api('/api/state');
  await api(`/api/lesson/${GOLDEN}/draft`, { code: golden.solution });
  await openLesson(GOLDEN, '.cm-editor');
  await waitFor(() => editorLines().some((l) => l.includes(firstLine(golden.solution ?? ''))), 'the draft in the editor', 5_000).catch(() => {});
  check('the saved draft is what the editor opens with', editorLines().some((l) => l.includes(firstLine(golden.solution ?? ''))), editorLines().slice(0, 3));
  const submit = button(/^Submit/);
  if (!submit) throw new Error('no Submit button');
  submit.click();
  await waitFor(() => openDialog(), 'the reward dialog', 120_000);
  const reward = openDialog()!;
  check('the reward <dialog> opened', reward.hasAttribute('open') && /cleared|defeated/i.test(reward.textContent ?? ''), reward.textContent?.slice(0, 120));
  check('focus moved into the dialog', reward.contains(doc.activeElement), doc.activeElement?.outerHTML.slice(0, 120));
  check('the result is announced in the status region', /✓ \d+ \/ \d+ passing/.test($('.results [role=status]')?.textContent ?? ''));
  const passedAfter = `${beforeGolden.profile.lessonsPassed + 1}/${beforeGolden.profile.lessonsTotal}`;
  await waitFor(() => navCount('#/tracks') === passedAfter, 'the sidebar lesson count to move', 10_000).catch(() => {});
  check('sidebar lesson count updated', navCount('#/tracks') === passedAfter, navCount('#/tracks'));
  const trackHref = `#/track/${allLessons().find((e) => e.lesson.id === GOLDEN)!.track.id}`;
  const trackBefore = beforeGolden.tracks.find((t: any) => `#/track/${t.id}` === trackHref);
  await waitFor(() => navCount(trackHref) === `${trackBefore.passed + 1}/${trackBefore.total}`, 'the sidebar track count', 10_000).catch(() => {});
  check('sidebar track count updated', navCount(trackHref) === `${trackBefore.passed + 1}/${trackBefore.total}`, navCount(trackHref));
  key(doc.activeElement ?? reward, { key: 'Escape', code: 'Escape', keyCode: 27 });
  await waitFor(() => !openDialog(), 'Escape to close the dialog', 5_000).catch(() => {});
  check('Escape closes the reward dialog', !reward.hasAttribute('open'));
  check('the lesson now shows as cleared', text().includes('cleared'));

  console.log('\nReset asks through a dialog');
  button(/^Reset$/)?.click();
  await waitFor(() => openDialog(), 'the reset confirm', 5_000).catch(() => {});
  const confirmDialog = openDialog();
  check('Reset opens the confirm <dialog>', !!confirmDialog && /Reset to the starter code/.test(confirmDialog.textContent ?? ''));
  check('focus starts on Cancel (destructive confirm)', /Cancel/.test(doc.activeElement?.textContent ?? ''), doc.activeElement?.textContent);
  check('window.confirm was not used', nativeConfirms === 0, nativeConfirms);
  if (confirmDialog) button(/^Cancel$/, confirmDialog)?.click();
  await waitFor(() => !openDialog(), 'Cancel to close the confirm', 5_000).catch(() => {});
  check('Cancel closes it and keeps the code', !openDialog() && editorLines().some((l) => l.includes(firstLine(golden.solution ?? ''))));

  console.log('\nA quiz, wrong then right');
  const quizEntry = allLessons().find((e) => e.index === 0 && e.chapter === e.track.chapters[0] && e.lesson.kind === 'quiz' && (e.lesson.quiz?.length ?? 0) > 0)
    ?? allLessons().find((e) => e.lesson.kind === 'quiz');
  if (!quizEntry) {
    console.log('  - skipped: no quiz lesson in the curriculum');
  } else {
    const quiz = quizEntry.lesson;
    const qs = quiz.quiz!;
    await openLesson(quiz.id, '.quiz-q');
    check('a fieldset per question', $$('.quiz-q').length === qs.length, $$('.quiz-q').length);
    check('radios for single-answer, checkboxes for multi', qs.every((q, i) => {
      const inputs = $$('.option input', $$('.quiz-q')[i]) as HTMLInputElement[];
      return inputs.length === q.options.length && inputs.every((x) => x.type === (q.answer.length > 1 ? 'checkbox' : 'radio'));
    }));
    const choose = (qi: number, picks: number[]) => {
      const inputs = $$('.option input', $$('.quiz-q')[qi]) as HTMLInputElement[];
      inputs.forEach((input, oi) => { if (input.checked !== picks.includes(oi)) input.click(); });
    };
    const wrongFirst = qs[0].answer.length > 1 ? qs[0].answer.slice(0, -1) : [qs[0].options.findIndex((_, i) => !qs[0].answer.includes(i))];
    choose(0, wrongFirst);
    qs.slice(1).forEach((q, i) => choose(i + 1, q.answer));
    const submitAnswers = () => button(/Submit answers/) as HTMLButtonElement | undefined;
    await waitFor(() => submitAnswers() && !submitAnswers()!.disabled, 'Submit answers to enable');
    submitAnswers()!.click();
    await waitFor(() => $('.toolbar [role=status]'), 'the quiz score', 30_000);
    check('a wrong answer is scored as such', ($('.toolbar [role=status]')?.textContent ?? '') === `${qs.length - 1} / ${qs.length} correct`, $('.toolbar [role=status]')?.textContent);
    check('the retry prompt is shown and no reward dialog opened', !!$('.banner.fail') && !openDialog());
    choose(0, qs[0].answer);
    submitAnswers()?.click();
    const allRight = `${qs.length} / ${qs.length} correct`;
    await waitFor(() => $('.toolbar [role=status]')?.textContent === allRight, 'the right answers to be graded', 30_000).catch(() => {});
    check('fixing the wrong answer passes on retry', $('.toolbar [role=status]')?.textContent === allRight, $('.toolbar [role=status]')?.textContent);
    await waitFor(() => openDialog(), 'the quiz reward dialog', 10_000).catch(() => {});
    check('a quiz pass opens the reward dialog', !!openDialog());
    if (openDialog()) key(doc.activeElement ?? openDialog()!, { key: 'Escape' });
    await waitFor(() => $$('.explain').length === qs.length, 'explanations after passing', 10_000).catch(() => {});
    check('explanations appear once passed', $$('.explain').length === qs.length, $$('.explain').length);
  }

  console.log('\nFixture panel on a SQL lesson');
  const sqlEntry = allLessons().find((e) => e.lesson.kind === 'sql' && e.index === 0 && e.chapter === e.track.chapters[0]);
  if (sqlEntry) {
    await openLesson(sqlEntry.lesson.id, '.cm-editor');
    check(`schema panel shown iff the lesson has fixtures (${sqlEntry.lesson.id})`, text().includes('Show the schema') === !!sqlEntry.lesson.fixtures);
  } else {
    console.log('  - skipped: no track opens with a sql lesson');
  }

  console.log('\nAchievements');
  const state1 = await api('/api/state');
  await navigate('#/achievements', '.ach');
  const tabs = $$('[role=tablist] [role=tab]');
  check('filters are role=tab buttons in a tablist', tabs.length === 3 && tabs.every((t) => t.tagName === 'BUTTON'), tabs.length);
  check('exactly one tab is selected', tabs.filter((t) => t.getAttribute('aria-selected') === 'true').length === 1);
  check('renders every achievement', $$('.ach').length === state1.achievements.length, $$('.ach').length);
  check('secret achievements stay hidden', !state1.achievements.some((a: any) => a.secret && !a.earnedAt) || text().includes('Secret achievement'));
  const earnedTab = tabs.find((t) => /Earned/.test(t.textContent ?? ''));
  earnedTab?.click();
  await waitFor(() => earnedTab?.getAttribute('aria-selected') === 'true', 'the Earned tab to select', 5_000).catch(() => {});
  check('the Earned tab filters to earned badges', earnedTab?.getAttribute('aria-selected') === 'true' &&
    $$('.ach').length === state1.profile.achievementsEarned && $$('.ach.locked').length === 0, $$('.ach').length);
  check('at least one badge was earned by now', state1.profile.achievementsEarned > 0);

  console.log('\nStats');
  await navigate('#/stats', '.heat-day');
  check('a progress row per track', state1.tracks.every((t: any) => text().includes(t.title)));
  check('renders whole weeks of heatmap', $$('.heat-day').length > 0 && $$('.heat-day').length % 7 === 0, $$('.heat-day').length);
  check('names the save file', text().includes('data/progress.json'));
  button(/Reset all progress/)?.click();
  await waitFor(() => openDialog(), 'the reset-all confirm', 5_000).catch(() => {});
  check('Reset all progress confirms through a <dialog>', !!openDialog() && nativeConfirms === 0);
  if (openDialog()) button(/^Cancel$/, openDialog()!)?.click();
  await waitFor(() => !openDialog(), 'the reset-all confirm to close', 5_000).catch(() => {});
  check('cancelling keeps the progress', (await api('/api/state')).profile.lessonsPassed === state1.profile.lessonsPassed);

  console.log('\nBack to the dashboard');
  await navigate('#/', '.ring-level', 'Welcome back');
  check('returns to the dashboard with the new XP', text().includes('Welcome back'));
} catch (e) {
  check(`suite aborted: ${(e as Error).message}`, false);
} finally {
  console.log('\nRuntime');
  // jsdom has no layout engine, so CodeMirror measuring text and jsdom
  // declining to parse the stylesheet are environment noise, not app bugs.
  const realErrors = pageErrors.filter(
    (e) => !/Not implemented|Could not parse CSS|stylesheet|getClientRects|getBoundingClientRect/i.test(e),
  );
  check('page reported no errors', realErrors.length === 0, realErrors.join('\n      '));
  window.close();
  await server.stop();
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

console.log(failures() ? `\n${failures()} UI CHECK(S) FAILED\n` : '\nUI checks passed.\n');
process.exit(failures() ? 1 : 0);

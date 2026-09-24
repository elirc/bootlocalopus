import { defineTrack } from '../load.ts';
import discriminate from './discriminate/chapter.ts';
import doubles from './doubles/chapter.ts';

export default defineTrack({
  id: 'testing',
  title: 'Testing & Quality',
  short: 'Testing',
  icon: '🧪',
  color: '#7ee787',
  weight: 1.2,
  blurb: 'Here you write the tests, and they get graded against planted bugs. A suite passes only if it catches every bug and still passes a rewrite that behaves the same, so tests that check how the code is written fail too. Can you write a test that fails for the right reason? That one skill separates a junior from a mid-level engineer.',
  chapters: [discriminate, doubles],
});

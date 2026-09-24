import { defineTrack } from '../load.ts';
import foundations from './foundations/chapter.ts';
import typeLevel from './type-level/chapter.ts';
import boundaries from './boundaries/chapter.ts';
import practice from './practice/chapter.ts';

export default defineTrack({
  id: 'ts',
  title: 'TypeScript for Production',
  icon: 'TS',
  color: '#3178c6',
  weight: 1,
  blurb: 'Types that catch real bugs instead of decorating your code. Graded by the actual compiler in strict mode — if tsc is happy, you pass.',
  chapters: [foundations, typeLevel, boundaries, practice],
});

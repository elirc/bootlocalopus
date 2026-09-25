import { defineTrack } from '../load.ts';
import foundations from './foundations/chapter.ts';
import typeLevel from './type-level/chapter.ts';
import boundaries from './boundaries/chapter.ts';
import practice from './practice/chapter.ts';
import genericsAdvancedV3 from './generics-advanced/chapter.ts';
import typingRealCodeV3 from './typing-real-code/chapter.ts';
import safetyPatternsV3 from './safety-patterns/chapter.ts';
import typeLevel2V3 from './type-level-2/chapter.ts';
import runtimeBoundariesV3 from './runtime-boundaries/chapter.ts';
import migrationV3 from './migration/chapter.ts';

export default defineTrack({
  id: 'ts',
  title: 'TypeScript for Production',
  icon: 'TS',
  color: '#3178c6',
  weight: 1,
  blurb: 'Types that catch real bugs instead of decorating your code. Graded by the actual compiler in strict mode — if tsc is happy, you pass.',
  chapters: [foundations, typeLevel, boundaries, practice, genericsAdvancedV3, typingRealCodeV3, safetyPatternsV3, typeLevel2V3, runtimeBoundariesV3, migrationV3],
});

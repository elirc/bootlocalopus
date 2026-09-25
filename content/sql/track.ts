import { defineTrack } from '../load.ts';
import modelling from './modelling/chapter.ts';
import querying from './querying/chapter.ts';
import performance from './performance/chapter.ts';
import fromCode from './from-code/chapter.ts';
import features from './features/chapter.ts';
import modelling2V3 from './modelling-2/chapter.ts';
import querying2V3 from './querying-2/chapter.ts';
import shapingOutputV3 from './shaping-output/chapter.ts';
import concurrencyV3 from './concurrency/chapter.ts';
import performance2V3 from './performance-2/chapter.ts';
import fromCode2V3 from './from-code-2/chapter.ts';

export default defineTrack({
  id: 'sql',
  title: 'Postgres & Data Modelling',
  icon: '🐘',
  color: '#336791',
  weight: 1.1,
  blurb: 'Schema design that prevents bad data, queries that answer real questions, and the performance traps that make an ORM look slow. Graded by running your SQL against a real Postgres.',
  chapters: [modelling, querying, performance, fromCode, features, modelling2V3, querying2V3, shapingOutputV3, concurrencyV3, performance2V3, fromCode2V3],
});

import { defineTrack } from '../load.ts';
import modelling from './modelling/chapter.ts';
import querying from './querying/chapter.ts';
import performance from './performance/chapter.ts';
import fromCode from './from-code/chapter.ts';
import features from './features/chapter.ts';

export default defineTrack({
  id: 'sql',
  title: 'Postgres & Data Modelling',
  icon: '🐘',
  color: '#336791',
  weight: 1.1,
  blurb: 'Schema design that prevents bad data, queries that answer real questions, and the performance traps that make an ORM look slow. Graded by running your SQL against a real Postgres.',
  chapters: [modelling, querying, performance, fromCode, features],
});

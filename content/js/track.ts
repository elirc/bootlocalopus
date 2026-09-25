import { defineTrack } from '../load.ts';
import closures from './closures/chapter.ts';
import async from './async/chapter.ts';
import data from './data/chapter.ts';
import errors from './errors/chapter.ts';
import textTime from './text-time/chapter.ts';
import objectsV3 from './objects/chapter.ts';
import modulesRuntimeV3 from './modules-runtime/chapter.ts';
import functionalV3 from './functional/chapter.ts';
import asyncPatternsV3 from './async-patterns/chapter.ts';
import collectionsV3 from './collections/chapter.ts';
import numbersTextV3 from './numbers-text/chapter.ts';

export default defineTrack({
  id: 'js',
  title: 'JavaScript You Actually Need',
  icon: 'JS',
  color: '#f0b429',
  weight: 1,
  blurb: 'The language mechanics that separate "it works" from "I know why it works": closures, the event loop, real concurrency control, and errors you can act on.',
  chapters: [closures, async, data, errors, textTime, objectsV3, modulesRuntimeV3, functionalV3, asyncPatternsV3, collectionsV3, numbersTextV3],
});

import { defineTrack } from '../load.ts';
import patterns from './patterns/chapter.ts';
import modulesApis from './modules-apis/chapter.ts';
import domain from './domain/chapter.ts';

export default defineTrack({
  id: 'design',
  title: "Software Design",
  short: "Design",
  icon: "◈",
  color: "#58a6ff",
  weight: 1,
  blurb: "Structure that survives change: patterns you will meet at work, module APIs other people can use, and domain models that make invalid states impossible.",
  chapters: [patterns, modulesApis, domain],
});

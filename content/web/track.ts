import { defineTrack } from '../load.ts';
import httpBrowser from './http-browser/chapter.ts';
import browserApis from './browser-apis/chapter.ts';
import performance from './performance/chapter.ts';

export default defineTrack({
  id: 'web',
  title: "Web Platform",
  short: "Web",
  icon: "🌐",
  color: "#e38c3a",
  weight: 1,
  blurb: "What the browser and HTTP actually do: fetch, CORS, cookies, caching, URLs, storage and performance — the layer every full-stack bug eventually lands in.",
  chapters: [httpBrowser, browserApis, performance],
});

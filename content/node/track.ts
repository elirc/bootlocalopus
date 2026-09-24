import { defineTrack } from '../load.ts';
import http from './http/chapter.ts';
import api from './api/chapter.ts';
import runtime from './runtime/chapter.ts';
import security from './security/chapter.ts';
import production from './production/chapter.ts';

export default defineTrack({
  id: 'node',
  title: 'Node & API Engineering',
  icon: '⬢',
  color: '#68a063',
  weight: 1.1,
  blurb: 'Build the server without the framework first, then add the layers a real service needs: validation, error envelopes, auth, rate limits, streams and a clean shutdown. Graded against real HTTP requests.',
  chapters: [http, api, runtime, security, production],
});

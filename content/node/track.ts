import { defineTrack } from '../load.ts';
import http from './http/chapter.ts';
import api from './api/chapter.ts';
import runtime from './runtime/chapter.ts';
import security from './security/chapter.ts';
import production from './production/chapter.ts';
import fsCliV3 from './fs-cli/chapter.ts';
import streamsEventsV3 from './streams-events/chapter.ts';
import httpAdvancedV3 from './http-advanced/chapter.ts';
import apiDesignV3 from './api-design/chapter.ts';
import backgroundWorkV3 from './background-work/chapter.ts';
import observabilityV3 from './observability/chapter.ts';
import authV3 from './auth/chapter.ts';
import inputSecurityV3 from './input-security/chapter.ts';
import resilienceV3 from './resilience/chapter.ts';

export default defineTrack({
  id: 'node',
  title: 'Node & API Engineering',
  icon: '⬢',
  color: '#68a063',
  weight: 1.1,
  blurb: 'Build the server without the framework first, then add the layers a real service needs: validation, error envelopes, auth, rate limits, streams and a clean shutdown. Graded against real HTTP requests.',
  chapters: [http, api, runtime, security, production, fsCliV3, streamsEventsV3, httpAdvancedV3, apiDesignV3, backgroundWorkV3, observabilityV3, authV3, inputSecurityV3, resilienceV3],
});

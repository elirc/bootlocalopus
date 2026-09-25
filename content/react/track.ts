import { defineTrack } from '../load.ts';
import state from './state/chapter.ts';
import composition from './composition/chapter.ts';
import asyncUi from './async-ui/chapter.ts';
import widgets from './widgets/chapter.ts';
import hooksDeepV3 from './hooks-deep/chapter.ts';
import stateManagementV3 from './state-management/chapter.ts';
import dataFetchingV3 from './data-fetching/chapter.ts';
import performanceV3 from './performance/chapter.ts';
import accessibilityV3 from './accessibility/chapter.ts';
import formsAdvancedV3 from './forms-advanced/chapter.ts';

export default defineTrack({
  id: 'react',
  title: 'React Patterns & Performance',
  icon: '⚛',
  color: '#61dafb',
  weight: 1.1,
  blurb: 'Component design that survives contact with a real product: derived state, composition, effects that clean up, and renders you can account for. Graded by rendering your components with Testing Library.',
  chapters: [state, composition, asyncUi, widgets, hooksDeepV3, stateManagementV3, dataFetchingV3, performanceV3, accessibilityV3, formsAdvancedV3],
});

import { defineTrack } from '../load.ts';
import state from './state/chapter.ts';
import composition from './composition/chapter.ts';
import asyncUi from './async-ui/chapter.ts';
import widgets from './widgets/chapter.ts';

export default defineTrack({
  id: 'react',
  title: 'React Patterns & Performance',
  icon: '⚛',
  color: '#61dafb',
  weight: 1.1,
  blurb: 'Component design that survives contact with a real product: derived state, composition, effects that clean up, and renders you can account for. Graded by rendering your components with Testing Library.',
  chapters: [state, composition, asyncUi, widgets],
});

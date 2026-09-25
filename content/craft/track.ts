import { defineTrack } from '../load.ts';
import working from './working/chapter.ts';
import systems from './systems/chapter.ts';
import deliveryV3 from './delivery/chapter.ts';
import communicationV3 from './communication/chapter.ts';

export default defineTrack({
  id: 'craft',
  title: 'Engineering Craft',
  icon: '🛠',
  color: '#b48ead',
  weight: 0.9,
  blurb: 'The judgement calls nobody writes a ticket for: reviewing code, using git deliberately, debugging systematically, scoping work honestly, and keeping a service observable. This is the part that actually gets you promoted.',
  chapters: [working, systems, deliveryV3, communicationV3],
});

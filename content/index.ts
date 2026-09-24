import type { Track } from './types.ts';
import jsTrack from './js/track.ts';
import tsTrack from './ts/track.ts';
import reactTrack from './react/track.ts';
import nodeTrack from './node/track.ts';
import sqlTrack from './sql/track.ts';
import testingTrack from './testing/track.ts';
import craftTrack from './craft/track.ts';

/**
 * Track order is the suggested path: language fundamentals, then types, then
 * the two halves of the stack, then data, then the judgement layer.
 *
 * Each track.ts pulls in its chapter.ts files, and each chapter.ts loads its
 * lesson folders through content/load.ts, which validates them as it goes.
 */
export const tracks: Track[] = [jsTrack, tsTrack, reactTrack, nodeTrack, sqlTrack, testingTrack, craftTrack];

const seen = new Map<string, string>();
for (const t of tracks) {
  for (const c of t.chapters) {
    for (const l of c.lessons) {
      const prev = seen.get(l.id);
      if (prev) throw new Error(`content: duplicate lesson id "${l.id}" (${prev} and ${t.id}/${c.id})`);
      seen.set(l.id, `${t.id}/${c.id}`);
    }
  }
}

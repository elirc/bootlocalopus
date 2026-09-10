import type { Track } from './types.ts';
import { jsTrack } from './js/index.ts';
import { tsTrack } from './ts/index.ts';
import { reactTrack } from './react/index.ts';
import { nodeTrack } from './node/index.ts';
import { sqlTrack } from './sql/index.ts';
import { craftTrack } from './craft/index.ts';

/**
 * Track order is the suggested path: language fundamentals, then types, then
 * the two halves of the stack, then data, then the judgement layer.
 */
export const tracks: Track[] = [jsTrack, tsTrack, reactTrack, nodeTrack, sqlTrack, craftTrack];

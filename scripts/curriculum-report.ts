import { tracks } from '../content/index.ts';

let totalLessons = 0;
let totalXp = 0;
const byKind: Record<string, number> = {};

console.log('track  | ch | lessons | xp    | bosses | kinds');
for (const track of tracks) {
  const lessons = track.chapters.flatMap((c) => c.lessons);
  const xp = lessons.reduce((sum, l) => sum + l.xp, 0);
  const kinds = [...new Set(lessons.map((l) => l.kind))].join(', ');
  totalLessons += lessons.length;
  totalXp += xp;
  for (const lesson of lessons) byKind[lesson.kind] = (byKind[lesson.kind] ?? 0) + 1;
  console.log(
    [
      track.id.padEnd(6),
      String(track.chapters.length).padStart(2),
      String(lessons.length).padStart(7),
      String(xp).padStart(5),
      String(lessons.filter((l) => l.boss).length).padStart(6),
      kinds,
    ].join(' | '),
  );
}
console.log(`\ntotal: ${totalLessons} lessons, ${totalXp} XP, ${tracks.length} tracks`);
console.log('by kind:', byKind);

import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'js-data',
  title: 'Data Shaping & Immutability',
  summary: 'Turning API payloads into something your UI can render without re-fetching.',
  lessons: [
    {
      id: 'js-group-index',
      title: 'groupBy, keyBy, countBy',
      kind: 'js',
      xp: 55,
      why: 'Reaching for lodash is fine; not knowing what it does is not. These three replace most nested loops.',
      tags: ['collections', 'data shaping'],
      hints: [
        'Normalise the key argument once: `const get = typeof key === "function" ? key : (item) => item[key];`',
        'Start from `Object.create(null)`, not `{}` — on `{}`, a "constructor" key finds `Object` and `??=` never fires. Then `(acc[k] ??= []).push(item)`.',
        'Object keys are strings, so `String(get(item))` gives you the "undefined" bucket for free.',
      ],
    },
    {
      id: 'js-immutable-update',
      title: 'Immutable nested updates',
      kind: 'js',
      xp: 80,
      why: 'React bails out of re-rendering by reference equality. Mutating state is why your component "does not update".',
      tags: ['immutability', 'structural sharing', 'react-adjacent'],
      hints: [
        'Recursion is much easier than a loop here. Base case: an empty path returns `value`.',
        'Shallow-copy the current level based on its type: `Array.isArray(node) ? [...node] : { ...node }`. Then assign only `copy[head] = recurse(node?.[head], rest)`.',
        'Spreading an array with `[...node]` keeps every element reference identical — that is the structural sharing the tests look for.',
        'For a missing intermediate, decide by the *next* key: `typeof nextKey === "number" ? [] : {}`.',
      ],
    },
    {
      id: 'js-generators',
      title: 'Generators for lazy pagination',
      kind: 'js',
      xp: 75,
      why: 'Turns "fetch every page into memory" into a stream you can stop consuming.',
      tags: ['generators', 'iterators', 'async'],
      hints: [
        'In `paginate`, loop: `let cursor; while (true) { const page = await fetchPage(cursor); yield* page.items; if (page.nextCursor == null) return; cursor = page.nextCursor; }`.',
        '`yield*` delegates to another iterable — it yields each element in turn.',
        'In `take`, `for await (const item of iterable) { out.push(item); if (out.length >= n) break; }`. The `break` is what stops the generator: it triggers the iterator\'s `return()`.',
        'Guard `take(0, ...)`: return `[]` before touching the iterable at all.',
      ],
    },
  ],
});

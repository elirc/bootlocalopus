import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'ts-type-level',
  title: 'Type-Level Tools',
  summary: 'infer, conditional types, template literals, and `satisfies` — the tools behind typed libraries.',
  lessons: [
    {
      id: 'ts-conditional',
      title: 'Conditional types and key filtering',
      kind: 'typecheck',
      xp: 80,
      why: 'How library authors derive one type from another instead of asking you to repeat yourself.',
      tags: ['conditional types', 'mapped types'],
      hints: [
        'To collect keys conditionally, map to the key itself or to `never`, then index: `{ [K in keyof T]: T[K] extends Fn ? K : never }[keyof T]`. The `never` members vanish from the union.',
        'Use `(...args: never[]) => unknown` as the "is a function" test — it is safer than `Function` and accepts any signature.',
        'For `Methods<T>`, `Pick<T, FunctionKeys<T>>` is the short version.',
        'For `Flatten<T>`, infer the element, then ask whether the element is itself an array: only then is it the answer.',
        'A conditional over a bare type parameter DISTRIBUTES over unions, and `boolean` is secretly `true | false`. Wrap both sides in a tuple — `[E] extends [readonly unknown[]]` — to compare the union as a whole.',
        'For `Unionise<T>`, map each key to `{ key: K; value: T[K] }` then index with `[keyof T]` to collapse the object into a union.',
      ],
    },
    {
      id: 'ts-infer',
      title: 'infer: pulling types apart',
      kind: 'typecheck',
      xp: 85,
      why: '`Awaited`, `ReturnType`, and every "give me the type inside" helper is one `infer`.',
      tags: ['infer', 'conditional types'],
      hints: [
        '`F extends (...args: never[]) => infer R ? R : never` — the `infer R` in the return position captures the return type.',
        'For parameters, infer the whole rest tuple: `F extends (...args: infer P) => unknown ? P : never`.',
        '`MyAwaited` must recurse: `T extends Promise<infer V> ? MyAwaited<V> : T`. That unwraps `Promise<Promise<X>>`.',
        'For `Last`, match a variadic tuple: `T extends readonly [...unknown[], infer L] ? L : never`.',
        'Careful with `FirstParam`: `() => void` IS assignable to `(a: infer A) => unknown` (extra parameters are allowed), so matching that way infers `unknown` rather than `never`. Infer the whole parameter tuple first, then destructure it.',
      ],
    },
    {
      id: 'ts-template-literal',
      title: 'Template literal types',
      kind: 'typecheck',
      xp: 85,
      why: 'Typed event names, typed route params, typed CSS keys — string patterns the compiler can check.',
      tags: ['template literals', 'string types'],
      hints: [
        'Interpolate inside a type: `` type Getter<K extends string> = `get${Capitalize<K>}` ``.',
        'For `Getters<T>`, remap keys: `` { [K in keyof T as Getter<K & string>]: () => T[K] } ``.',
        'For `RouteParams`, recurse on the pattern: match `` `${string}:${infer Param}/${infer Rest}` `` to take one param and continue, then `` `${string}:${infer Param}` `` for the final one, else `{}`.',
        'For `Split`, `` S extends `${infer Head}${D}${infer Tail}` ? [Head, ...Split<Tail, D>] : [S] ``.',
      ],
    },
    {
      id: 'ts-satisfies',
      title: 'const, satisfies, and derived unions',
      kind: 'typecheck',
      xp: 75,
      why: 'Stops the "I have a config object and a union of its keys that drift apart" problem for good.',
      tags: ['satisfies', 'const assertions', 'literal types'],
      hints: [
        'Combine both: `} as const satisfies Record<string, { level: number; label: string }>;` — `as const` keeps the literals, `satisfies` type-checks the shape.',
        '`export type Role = keyof typeof ROLES;` derives the key union automatically.',
        'For the value union, index into the mapped type: `(typeof ROLES)[Role]["level"]`.',
        '`export const STATUSES = [...] as const;` then `export type Status = (typeof STATUSES)[number];`.',
        '`defineRoles<const T extends Record<string, { level: number; label: string }>>(roles: T): T { return roles; }` — the `const` modifier on `T` (TS 5.0+) is what keeps `7` from widening to `number`.',
      ],
    },
  ],
});

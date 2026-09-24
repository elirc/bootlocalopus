import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'ts-foundations',
  title: 'Type Foundations',
  summary: 'Narrowing, unions, generics and the utility types — rebuilt from scratch so you know what they do.',
  lessons: [
    {
      id: 'ts-narrowing',
      title: 'Narrowing and type guards',
      kind: 'typecheck',
      xp: 60,
      why: 'Where `any` sneaks into a codebase: nobody knew how to narrow `unknown` properly.',
      tags: ['narrowing', 'type guards', 'unknown'],
      hints: [
        'A type predicate is a return type like `value is User`. It tells the compiler what a `true` result proves — and it is on you to make the body actually prove it.',
        'For `isUser`: `typeof value === "object" && value !== null && "id" in value && typeof value.id === "string"` — after `"id" in value`, `value.id` is readable as `unknown`. Repeat for `name`.',
        'For `isNonNull`, the signature is `<T>(value: T | null | undefined): value is T`. Used in `.filter(isNonNull)` it removes null from the element type.',
        'For `hasKey`, the useful signature is `(value: unknown, key: K): value is Record<K, unknown>` — after it, `value[key]` is `unknown`, which is honest and still narrowable.',
        'Inside `describe`, `typeof value === "object" && value !== null` is what separates a real object from `null`, because `typeof null === "object"`.',
      ],
    },
    {
      id: 'ts-discriminated-union',
      title: 'Discriminated unions and exhaustiveness',
      kind: 'typecheck',
      xp: 70,
      why: 'The single highest-value pattern in TypeScript: makes impossible states unrepresentable and new cases a compile error.',
      tags: ['unions', 'exhaustiveness', 'state machines'],
      hints: [
        'Write it as four object types joined by `|`: `{ status: "idle" } | { status: "loading" } | { status: "success"; data: T } | { status: "error"; error: Error }`.',
        'Inside `switch (state.status)`, each `case` narrows `state` to that member, so `state.data` is only reachable in the success branch.',
        'In `default`, call `return assertNever(state)`. If every case is handled, `state` is `never` there and it compiles; miss one and the argument is not assignable to `never`.',
      ],
    },
    {
      id: 'ts-generics',
      title: 'Generics with real constraints',
      kind: 'typecheck',
      xp: 75,
      why: 'Generic helpers that keep their types are the difference between a useful util and a cast farm.',
      tags: ['generics', 'keyof', 'constraints'],
      hints: [
        '`pluck<T, K extends keyof T>(items: T[], key: K): T[K][]` — the constraint `K extends keyof T` is what makes `item[key]` legal.',
        'For `pick`, build the result with a loop and start from `{} as Pick<T, K>`; one assertion in an internal builder is the pragmatic choice here.',
        '`indexById` needs `T extends { id: string | number }` so `item.id` is known to exist.',
        '`merge` returns `A & B`; `{ ...a, ...b } as A & B` is the usual pragmatic implementation.',
      ],
    },
    {
      id: 'ts-utility-types',
      title: 'Rebuild the utility types',
      kind: 'typecheck',
      xp: 80,
      why: 'Once you have written Pick and Omit yourself, mapped types stop looking like magic.',
      tags: ['mapped types', 'keyof', 'utility types'],
      hints: [
        'The mapped type shape is `{ [K in keyof T]: T[K] }`. Add `?` for Partial and `-?` to remove it for Required.',
        '`readonly [K in keyof T]` adds the modifier; `MyPick` maps over `K` instead of `keyof T`.',
        'For Omit, the trick is `Exclude<keyof T, K>` — or, from first principles, a key remapping: `[P in keyof T as P extends K ? never : P]: T[P]`.',
        'For `DeepReadonly`, recurse conditionally: functions pass through, arrays become `ReadonlyArray<DeepReadonly<E>>`, objects map recursively, everything else is returned as is.',
      ],
    },
  ],
});

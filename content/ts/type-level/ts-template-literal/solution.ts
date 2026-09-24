export type Getter<K extends string> = `get${Capitalize<K>}`;

export type Getters<T> = { [K in keyof T as Getter<K & string>]: () => T[K] };

export type EventName<T extends string> = `on${Capitalize<T>}`;

export type RouteParams<P extends string> =
  P extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param]: string } & RouteParams<`/${Rest}`>
    : P extends `${string}:${infer Param}`
      ? { [K in Param]: string }
      : {};

export type Split<S extends string, D extends string> =
  S extends `${infer Head}${D}${infer Tail}` ? [Head, ...Split<Tail, D>] : [S];

// TODO: every property optional, all the way down.
export type DeepPartial<T> = Partial<T>;

// TODO: every property and array readonly, all the way down.
export type DeepReadonly<T> = Readonly<T>;

// TODO: every property required, all the way down.
export type DeepRequired<T> = Required<T>;

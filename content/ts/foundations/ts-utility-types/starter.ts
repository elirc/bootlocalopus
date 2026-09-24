export type MyPartial<T> = T;      // TODO
export type MyRequired<T> = T;     // TODO
export type MyReadonly<T> = T;     // TODO
export type MyPick<T, K extends keyof T> = T;   // TODO
export type MyOmit<T, K extends keyof T> = T;   // TODO
export type MyRecord<K extends keyof any, V> = unknown;  // TODO
export type DeepReadonly<T> = T;   // TODO

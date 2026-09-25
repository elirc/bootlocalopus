// TODO: 'created_at' -> 'createdAt'
export type CamelCase<S extends string> = S;

// TODO: 'createdAt' -> 'created_at'
export type SnakeCase<S extends string> = S;

// TODO: rename every key, recursively
export type CamelKeys<T> = T;
export type SnakeKeys<T> = T;

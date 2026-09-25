export type Exec = (sql: string) => Promise<unknown[]>;

// TODO: `selectFrom<User>('users')(exec, 'id', 'email')` should resolve to
// Pick<User, 'id' | 'email'>[], with the columns inferred.
export function selectFrom(table: string) {
  return async (exec: Exec, ...columns: string[]): Promise<unknown[]> => {
    return exec(`select ${columns.join(', ')} from ${table}`);
  };
}

// TODO: handlersFor<Events>()({ signup: (p) => … }) with p inferred.
export function handlersFor() {
  return (handlers: Record<string, (payload: any) => void>) => ({
    handles: Object.keys(handlers),
    dispatch(event: string, payload: unknown): void {
      handlers[event](payload);
    },
  });
}

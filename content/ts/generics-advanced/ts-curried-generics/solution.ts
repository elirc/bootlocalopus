export type Exec = (sql: string) => Promise<unknown[]>;

// Call 1 takes the type argument nobody can infer; call 2 infers the rest.
export function selectFrom<Row>(table: string) {
  return async <K extends keyof Row & string>(exec: Exec, ...columns: K[]): Promise<Pick<Row, K>[]> => {
    const rows = await exec(`select ${columns.join(', ')} from ${table}`);
    // The database is outside the type system: this is the one trusted claim.
    return rows as Pick<Row, K>[];
  };
}

export function handlersFor<Events>() {
  // K is inferred from the keys of the object literal, and each value is
  // contextually typed from Events, so handlers need no annotations.
  return <K extends keyof Events>(handlers: { [P in K]: (payload: Events[P]) => void }) => ({
    handles: Object.keys(handlers) as K[],
    dispatch<E extends K>(event: E, payload: Events[E]): void {
      handlers[event](payload);
    },
  });
}

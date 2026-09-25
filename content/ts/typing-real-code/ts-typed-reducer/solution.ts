/** Any object of action creators: functions returning something with a string `type`. */
export type ActionCreators = Record<string, (...args: never[]) => { type: string }>;

/** The union of everything a map of action creators can produce. */
export type ActionsOf<M extends ActionCreators> = ReturnType<M[keyof M]>;

// `as const` on the discriminant alone keeps it a literal ('cart/add', not
// string) without making the whole action readonly.
export const cartActions = {
  add: (sku: string, qty: number) => ({ type: 'cart/add' as const, sku, qty }),
  remove: (sku: string) => ({ type: 'cart/remove' as const, sku }),
  clear: () => ({ type: 'cart/clear' as const }),
};

export type CartAction = ActionsOf<typeof cartActions>;

export interface CartLine {
  readonly sku: string;
  readonly qty: number;
}

export interface CartState {
  readonly lines: readonly CartLine[];
}

export const initialCart: CartState = { lines: [] };

function assertNever(action: never): never {
  throw new Error(`unhandled action: ${JSON.stringify(action)}`);
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'cart/add': {
      const existing = state.lines.find((line) => line.sku === action.sku);
      if (!existing) return { lines: [...state.lines, { sku: action.sku, qty: action.qty }] };
      return {
        lines: state.lines.map((line) =>
          line.sku === action.sku ? { ...line, qty: line.qty + action.qty } : line,
        ),
      };
    }
    case 'cart/remove':
      return { lines: state.lines.filter((line) => line.sku !== action.sku) };
    case 'cart/clear':
      return initialCart;
    default:
      return assertNever(action);
  }
}

/** Wraps each creator so calling it dispatches the action: same parameters, returns void. */
export function bindActions<M extends ActionCreators>(
  creators: M,
  dispatch: (action: ActionsOf<M>) => void,
): { [K in keyof M]: (...args: Parameters<M[K]>) => void } {
  const bound = {} as { [K in keyof M]: (...args: Parameters<M[K]>) => void };
  for (const name of Object.keys(creators) as (keyof M)[]) {
    bound[name] = (...args) => dispatch(creators[name](...args) as ActionsOf<M>);
  }
  return bound;
}

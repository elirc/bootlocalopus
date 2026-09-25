// The creators return `type: string`, so the "union" of actions cannot be
// discriminated, the reducer takes `any`, and bindActions erases everything.

// TODO: the union of everything a map of action creators can produce.
export type ActionsOf<M> = { type: string };

export const cartActions = {
  add: (sku: string, qty: number) => ({ type: 'cart/add', sku, qty }),
  remove: (sku: string) => ({ type: 'cart/remove', sku }),
  clear: () => ({ type: 'cart/clear' }),
};

export type CartAction = ActionsOf<typeof cartActions>;

export interface CartLine {
  sku: string;
  qty: number;
}

export interface CartState {
  lines: CartLine[];
}

export const initialCart: CartState = { lines: [] };

export function cartReducer(state: CartState, action: any): CartState {
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
      return state;
  }
}

export function bindActions(creators: any, dispatch: (action: any) => void): any {
  const bound: any = {};
  for (const name of Object.keys(creators)) {
    bound[name] = (...args: any[]) => dispatch(creators[name](...args));
  }
  return bound;
}

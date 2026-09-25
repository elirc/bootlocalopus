import { cartActions, cartReducer, bindActions, initialCart } from './solution';
import type { ActionsOf, CartAction, CartState } from './solution';

// --- the action union is derived from the creators, with literal discriminants
type _types = Expect<Equal<CartAction['type'], 'cart/add' | 'cart/remove' | 'cart/clear'>>;
type Add = Extract<CartAction, { type: 'cart/add' }>;
type _addSku = Expect<Equal<Add['sku'], string>>;
type _addQty = Expect<Equal<Add['qty'], number>>;
type _notAny = ExpectFalse<IsAny<CartAction>>;
// A creator's result is assignable to the union, and the union narrows on `type`.
const a1: CartAction = cartActions.add('sku-1', 2);
const a2: CartAction = cartActions.clear();
declare const some: CartAction;
if (some.type === 'cart/remove') {
  const sku: string = some.sku;
  // @ts-expect-error remove has no qty
  some.qty;
}

// --- ActionsOf works for any creators map
const todoActions = {
  toggle: (id: number) => ({ type: 'todo/toggle' as const, id }),
  rename: (id: number, title: string) => ({ type: 'todo/rename' as const, id, title }),
};
type TodoAction = ActionsOf<typeof todoActions>;
type _todo = Expect<Equal<TodoAction['type'], 'todo/toggle' | 'todo/rename'>>;
type _rename = Expect<Equal<Extract<TodoAction, { type: 'todo/rename' }>['title'], string>>;

// --- the reducer only accepts real actions, fully formed
const s1: CartState = cartReducer(initialCart, cartActions.add('sku-1', 1));
cartReducer(s1, { type: 'cart/remove', sku: 'sku-1' });
// @ts-expect-error not a cart action
cartReducer(s1, { type: 'cart/checkout' });
// @ts-expect-error add needs a qty
cartReducer(s1, { type: 'cart/add', sku: 'sku-1' });
// @ts-expect-error qty is a number
cartReducer(s1, { type: 'cart/add', sku: 'sku-1', qty: '2' });
// @ts-expect-error state is immutable
s1.lines.push({ sku: 'x', qty: 1 });

// --- bindActions keeps each creator's parameters and dispatches the union
declare function dispatch(action: CartAction): void;
const cart = bindActions(cartActions, dispatch);
type _boundAdd = Expect<Equal<Parameters<typeof cart.add>, [sku: string, qty: number]>>;
type _boundAddReturn = Expect<Equal<ReturnType<typeof cart.add>, void>>;
type _boundClear = Expect<Equal<Parameters<typeof cart.clear>, []>>;
cart.add('sku-2', 3);
cart.remove('sku-2');
// @ts-expect-error qty missing
cart.add('sku-2');
// @ts-expect-error not a creator
cart.checkout();

// The dispatch must accept the creators' actions.
declare function dispatchTodo(action: TodoAction): void;
// @ts-expect-error a todo dispatcher cannot dispatch cart actions
bindActions(cartActions, dispatchTodo);

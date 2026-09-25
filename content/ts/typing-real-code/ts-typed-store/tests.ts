import { combineReducers, createStore, createSelector } from './solution';
import type { Reducer, StateOf, ActionOf, Store } from './solution';

// --- two slices, written the ordinary way
type CartAction = { type: 'cart/add'; sku: string } | { type: 'cart/clear' };
interface CartState { skus: readonly string[] }
declare const cartReducer: (state: CartState, action: CartAction) => CartState;

type UserAction = { type: 'user/login'; id: string } | { type: 'user/logout' };
interface UserState { id: string | null }
declare const userReducer: (state: UserState, action: UserAction) => UserState;

const asReducer: Reducer<CartState, CartAction> = cartReducer;
type _stateOf = Expect<Equal<StateOf<typeof cartReducer>, CartState>>;
type _actionOf = Expect<Equal<ActionOf<typeof cartReducer>, CartAction>>;

// --- combineReducers: state is an object of slice states, actions are the union
const root = combineReducers({ cart: cartReducer, user: userReducer });
type RootState = StateOf<typeof root>;
type RootAction = ActionOf<typeof root>;
type _root = Expect<Equal<RootState, { cart: CartState; user: UserState }>>;
type _rootNotAny = ExpectFalse<IsAny<RootState['cart']>>;
type _actions = Expect<Equal<RootAction, CartAction | UserAction>>;
type _rootReducer = Expect<Equal<typeof root, Reducer<RootState, RootAction>>>;

// @ts-expect-error a slice must be a reducer
combineReducers({ cart: cartReducer, count: 3 });

// It nests.
type UiAction = { type: 'ui/toggle' };
declare const uiReducer: (state: { open: boolean }, action: UiAction) => { open: boolean };
const app = combineReducers({ shop: root, ui: uiReducer });
type _app = Expect<Equal<StateOf<typeof app>, { shop: { cart: CartState; user: UserState }; ui: { open: boolean } }>>;
type _appActions = Expect<Equal<ActionOf<typeof app>, CartAction | UserAction | UiAction>>;

// --- createStore: the reducer decides the types; the initial state is checked
const store = createStore(root, { cart: { skus: [] }, user: { id: null } });
type _store = Expect<Equal<typeof store, Store<RootState, RootAction>>>;
// @ts-expect-error typo in a slice name must not widen the state
createStore(root, { cart: { skus: [] }, usr: { id: null } });
// @ts-expect-error a slice is missing
createStore(root, { cart: { skus: [] } });
// @ts-expect-error wrong slice shape
createStore(root, { cart: { skus: [] }, user: { id: 42 } });

const dispatched = store.dispatch({ type: 'user/login', id: 'u1' });
type _dispatched = Expect<Equal<typeof dispatched, RootAction>>;
store.dispatch({ type: 'cart/clear' });
// @ts-expect-error login needs an id
store.dispatch({ type: 'user/login' });
// @ts-expect-error nobody handles this action
store.dispatch({ type: 'cart/checkout' });

const state: RootState = store.getState();
const skuCount = store.select((s) => s.cart.skus.length);
type _skuCount = Expect<Equal<typeof skuCount, number>>;
const unsubscribe: () => void = store.subscribe((s) => {
  const id: string | null = s.user.id;
});
// @ts-expect-error not a key of the state
store.select((s) => s.orders);

// --- createSelector: the combiner is typed from the input selectors
const selectSkus = (s: RootState) => s.cart.skus;
const selectUserId = (s: RootState) => s.user.id;
const selectSummary = createSelector([selectSkus, selectUserId], (skus, id) => {
  type _skus = Expect<Equal<typeof skus, readonly string[]>>;
  type _id = Expect<Equal<typeof id, string | null>>;
  return `${id ?? 'guest'}: ${skus.length}`;
});
type _summary = Expect<Equal<typeof selectSummary, (state: RootState) => string>>;
const summary: string = store.select(selectSummary);

const selectIsEmpty = createSelector([selectSkus], (skus) => skus.length === 0);
type _isEmpty = Expect<Equal<typeof selectIsEmpty, (state: RootState) => boolean>>;

// @ts-expect-error the combiner's parameter does not match the selector's result
createSelector([selectSkus], (skus: number) => skus);
// @ts-expect-error the combiner takes the results in order
createSelector([selectSkus, selectUserId], (id: string | null, skus: readonly string[]) => 0);

// Selectors over different states: the result needs a state that satisfies both.
const selectFlag = (s: { flag: boolean }) => s.flag;
const mixed = createSelector([selectSkus, selectFlag], (skus, flag) => flag && skus.length > 0);
const withFlag = { ...store.getState(), flag: true };
const ok: boolean = mixed(withFlag);
// @ts-expect-error the store's state has no flag
store.select(mixed);

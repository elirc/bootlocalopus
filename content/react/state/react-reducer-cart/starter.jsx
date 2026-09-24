import { useReducer } from 'react';

export function cartReducer(state, action) {
  // TODO
  return state;
}

export function Cart({ catalogue }) {
  const [state, dispatch] = useReducer(cartReducer, { lines: [] });
  // TODO
  return <div />;
}

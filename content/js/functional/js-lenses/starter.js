export const lens = (get, set) => ({ get, set });

const todo = (name) => () => {
  throw new Error(`${name}: not implemented`);
};

export const prop = todo('prop');
export const find = todo('find');
export const compose = todo('compose');
export const path = todo('path');
export const view = todo('view');
export const set = todo('set');
export const over = todo('over');

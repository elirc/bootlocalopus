// Each builder returns a function. Replace every `todo` with a real one.
const todo = (name) => () => {
  throw new Error(`${name}: not implemented`);
};

export const prop = todo('prop');
export const propEq = todo('propEq');
export const gte = todo('gte');
export const lte = todo('lte');
export const includesText = todo('includesText');
export const where = todo('where');
export const allOf = todo('allOf');
export const anyOf = todo('anyOf');
export const not = todo('not');
export const fromQuery = todo('fromQuery');

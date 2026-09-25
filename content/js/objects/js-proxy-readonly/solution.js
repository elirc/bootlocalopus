// target -> its view. Weak, so a view never keeps old state alive.
const viewsByTarget = new WeakMap();
// Every view we created, for isReadonlyView and to avoid double wrapping.
const views = new WeakSet();

const isWrappable = (value) => {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const refuse = (action) => (_target, key) => {
  throw new TypeError(`Cannot ${action} "${String(key)}": this is a read-only view`);
};

const handler = {
  get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver);
    // Proxy invariant: a non-configurable, non-writable data property must be
    // reported as its real value.
    const desc = Reflect.getOwnPropertyDescriptor(target, key);
    if (desc && desc.configurable === false && desc.writable === false) return value;
    return readonlyView(value);
  },
  set: refuse('set'),
  deleteProperty: refuse('delete'),
  defineProperty: refuse('define'),
  setPrototypeOf() {
    throw new TypeError('Cannot change the prototype of a read-only view');
  },
};

export function readonlyView(target) {
  if (!isWrappable(target) || views.has(target)) return target;
  let view = viewsByTarget.get(target);
  if (!view) {
    view = new Proxy(target, handler);
    viewsByTarget.set(target, view);
    views.add(view);
  }
  return view;
}

export function isReadonlyView(value) {
  return typeof value === 'object' && value !== null && views.has(value);
}

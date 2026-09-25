// proxy -> its state record. Also answers "is this value a draft?".
const states = new WeakMap();

function isDraftable(value) {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function produce(base, recipe) {
  if (!isDraftable(base) || states.has(base)) {
    throw new TypeError('produce: base must be a plain object or an array');
  }
  const revokes = [];
  const root = createDraft(base, null, revokes);
  try {
    recipe(root);
    return finalize(root);
  } finally {
    for (const revoke of revokes) revoke();
  }
}

function createDraft(base, parent, revokes) {
  const state = {
    base,
    copy: null,
    modified: false,
    parent,
    drafts: new Map(), // key -> child draft of base[key]
    revokes,
    final: undefined,
  };
  const latest = () => state.copy ?? state.base;

  const { proxy, revoke } = Proxy.revocable(base, {
    get(_target, key) {
      const source = latest();
      const value = Reflect.get(source, key);
      // Only draft values that still come from base; anything the recipe
      // assigned is returned as-is (it may already be a draft).
      if (!Object.hasOwn(source, key) || !isDraftable(value) || value !== state.base[key]) return value;
      let child = state.drafts.get(key);
      if (!child) {
        child = createDraft(value, state, revokes);
        state.drafts.set(key, child);
      }
      return child;
    },
    set(_target, key, value) {
      const source = latest();
      // Assigning the value already there -- or the draft of it -- is not a change.
      const unchanged = Object.hasOwn(source, key) && (Object.is(source[key], value) ||
        (state.drafts.get(key) === value && source[key] === state.base[key]));
      if (unchanged) return true;
      markModified(state);
      state.copy[key] = value;
      return true;
    },
    deleteProperty(_target, key) {
      if (!Object.hasOwn(latest(), key)) return true;
      markModified(state);
      delete state.copy[key];
      return true;
    },
    has: (_target, key) => key in latest(),
    ownKeys: () => Reflect.ownKeys(latest()),
    getOwnPropertyDescriptor(_target, key) {
      const desc = Reflect.getOwnPropertyDescriptor(latest(), key);
      // Report the key as configurable unless the target itself pins it (array length).
      if (desc && Object.getOwnPropertyDescriptor(state.base, key)?.configurable !== false) desc.configurable = true;
      return desc;
    },
    defineProperty() {
      throw new TypeError('produce: defineProperty is not supported on a draft');
    },
    setPrototypeOf() {
      throw new TypeError('produce: cannot change the prototype of a draft');
    },
  });

  states.set(proxy, state);
  revokes.push(revoke);
  return proxy;
}

function markModified(state) {
  for (let s = state; s && !s.modified; s = s.parent) {
    s.modified = true;
    s.copy = Array.isArray(s.base)
      ? s.base.slice()
      : Object.assign(Object.create(Object.getPrototypeOf(s.base)), s.base);
  }
}

function finalize(draft) {
  const state = states.get(draft);
  if (!state.modified) return state.base;
  if (state.final) return state.final;
  const copy = state.copy;
  state.final = copy;

  for (const key of Object.keys(copy)) {
    const value = copy[key];
    if (states.has(value)) {
      copy[key] = finalize(value); // a draft, in its own place or moved here
    } else if (value === state.base[key] && state.drafts.has(key)) {
      copy[key] = finalize(state.drafts.get(key)); // the child draft was read (and maybe changed)
    } else if (value !== state.base[key] && isDraftable(value)) {
      finalizeNew(value, new Set()); // a new value from the recipe may contain drafts
    }
  }
  return copy;
}

function finalizeNew(value, seen) {
  if (seen.has(value) || Object.isFrozen(value)) return;
  seen.add(value);
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (states.has(child)) value[key] = finalize(child);
    else if (isDraftable(child)) finalizeNew(child, seen);
  }
}

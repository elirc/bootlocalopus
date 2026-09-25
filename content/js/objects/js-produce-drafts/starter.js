export function produce(base, recipe) {
  // TODO:
  // 1. create a revocable Proxy draft over `base` with a state record
  //    { base, copy: null, modified: false, parent, ... }
  // 2. run recipe(draft)
  // 3. finalise: unmodified drafts become their base, modified ones their copy
  // 4. revoke every proxy you created
  throw new Error('produce: not implemented');
}

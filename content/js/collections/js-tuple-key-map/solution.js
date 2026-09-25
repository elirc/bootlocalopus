// A trie of Maps: one level per tuple position. A node is
// { children: Map<element, node>, entry: { key, value } | null }.
// Entries live in an insertion-ordered Set so iteration follows first insertion.
const newNode = () => ({ children: new Map(), entry: null });

export class TupleMap {
  #root = newNode();
  #entries = new Set();

  #find(key) {
    let node = this.#root;
    for (const part of key) {
      node = node.children.get(part);
      if (!node) return null;
    }
    return node;
  }

  set(key, value) {
    let node = this.#root;
    for (const part of key) {
      let child = node.children.get(part);
      if (!child) {
        child = newNode();
        node.children.set(part, child);
      }
      node = child;
    }
    if (node.entry) {
      node.entry.value = value;
    } else {
      node.entry = { key: [...key], value };
      this.#entries.add(node.entry);
    }
    return this;
  }

  get(key) {
    return this.#find(key)?.entry?.value;
  }

  has(key) {
    return Boolean(this.#find(key)?.entry);
  }

  delete(key) {
    const node = this.#find(key);
    if (!node?.entry) return false;
    this.#entries.delete(node.entry);
    node.entry = null;
    return true;
  }

  get size() {
    return this.#entries.size;
  }

  entries() {
    return [...this.#entries].map(({ key, value }) => [[...key], value]);
  }
}

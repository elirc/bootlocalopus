export class ConstraintError extends Error {
  constructor(field, value) {
    super(`${field} ${String(value)} is already taken`);
    this.name = 'ConstraintError';
    this.field = field;
    this.value = value;
  }
}

// The comparison Map and Set use for keys.
const sameValueZero = (a, b) => a === b || (Number.isNaN(a) && Number.isNaN(b));
const isNull = (v) => v === null || v === undefined;

// --- sorting, as in the multi-key sort lesson -------------------------------
const isMissing = (v) => isNull(v) || Number.isNaN(v);

function toComparator(criterion) {
  const { key, dir = 'asc' } = typeof criterion === 'object' ? criterion : { key: criterion };
  if (dir !== 'asc' && dir !== 'desc') throw new RangeError(`dir must be "asc" or "desc", got ${dir}`);
  const sign = dir === 'desc' ? -1 : 1;
  const get = typeof key === 'function' ? key : (r) => r[key];
  return (x, y) => {
    let a = get(x);
    let b = get(y);
    const aMissing = isMissing(a);
    const bMissing = isMissing(b);
    if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
    if (a instanceof Date) a = a.getTime();
    if (b instanceof Date) b = b.getTime();
    return sign * (a < b ? -1 : a > b ? 1 : 0);
  };
}

function sortBy(items, criteria) {
  const comparators = criteria.map(toComparator);
  return items.toSorted((x, y) => {
    for (const compare of comparators) {
      const r = compare(x, y);
      if (r !== 0) return r;
    }
    return 0;
  });
}

// --- the store ----------------------------------------------------------------
export class Store {
  #key;
  #unique;
  #rows = new Map(); // id -> frozen record, in first-insertion order
  #seq = new Map(); // id -> insertion counter, to order index buckets
  #nextSeq = 0;
  #index = new Map(); // field -> Map(value -> Set(id))

  constructor({ key = 'id', indexes = [], unique = [] } = {}) {
    this.#key = key;
    this.#unique = [...unique];
    for (const field of [...indexes, ...unique]) {
      if (field !== key) this.#index.set(field, new Map());
    }
  }

  get size() {
    return this.#rows.size;
  }

  get(id) {
    return this.#rows.get(id);
  }

  insert(record) {
    return this.insertMany([record])[0];
  }

  insertMany(records) {
    const rows = records.map((r) => Object.freeze({ ...r }));
    // Validate the whole batch before touching anything.
    const batchKeys = new Set();
    const batchUnique = new Map(this.#unique.map((f) => [f, new Set()]));
    for (const row of rows) {
      const id = row[this.#key];
      if (this.#rows.has(id) || batchKeys.has(id)) throw new ConstraintError(this.#key, id);
      batchKeys.add(id);
      this.#checkUnique(row, undefined, batchUnique);
    }
    for (const row of rows) {
      const id = row[this.#key];
      this.#rows.set(id, row);
      this.#seq.set(id, this.#nextSeq++);
      this.#addToIndexes(row);
    }
    return rows;
  }

  update(id, patch) {
    const old = this.#rows.get(id);
    if (!old) return null;
    if (Object.hasOwn(patch, this.#key) && !sameValueZero(patch[this.#key], id)) {
      throw new ConstraintError(this.#key, patch[this.#key]);
    }
    const next = Object.freeze({ ...old, ...patch });
    this.#checkUnique(next, id);
    // Validation passed: now it is safe to change state.
    this.#removeFromIndexes(old);
    this.#rows.set(id, next); // an existing Map key keeps its position
    this.#addToIndexes(next);
    return next;
  }

  delete(id) {
    const old = this.#rows.get(id);
    if (!old) return false;
    this.#removeFromIndexes(old);
    this.#rows.delete(id);
    this.#seq.delete(id);
    return true;
  }

  findBy(field, value) {
    if (field === this.#key) {
      const row = this.#rows.get(value);
      return row ? [row] : [];
    }
    const index = this.#index.get(field);
    if (!index) throw new Error(`no index on "${field}"`);
    return this.#inOrder(index.get(value) ?? []);
  }

  query({ where = {}, orderBy = [] } = {}) {
    const fields = Object.keys(where);
    // Start from the narrowest thing we have: the primary key, an index, or everything.
    let candidates;
    const indexed = fields.find((f) => f === this.#key || this.#index.has(f));
    if (indexed !== undefined) {
      candidates = this.findBy(indexed, where[indexed]);
    } else {
      candidates = [...this.#rows.values()];
    }
    const matches = candidates.filter((row) => fields.every((f) => sameValueZero(row[f], where[f])));
    return sortBy(matches, orderBy);
  }

  #inOrder(ids) {
    return [...ids]
      .sort((a, b) => this.#seq.get(a) - this.#seq.get(b))
      .map((id) => this.#rows.get(id));
  }

  // Throws if `row` takes a unique value held by a record other than `selfId`,
  // or by an earlier record of the same batch.
  #checkUnique(row, selfId, batch) {
    for (const field of this.#unique) {
      if (field === this.#key) continue;
      const value = row[field];
      if (isNull(value)) continue;
      const holders = this.#index.get(field).get(value);
      const takenByOther = holders && [...holders].some((id) => !sameValueZero(id, selfId));
      if (takenByOther || batch?.get(field).has(value)) throw new ConstraintError(field, value);
      batch?.get(field).add(value);
    }
  }

  #addToIndexes(row) {
    const id = row[this.#key];
    for (const [field, index] of this.#index) {
      const value = row[field];
      let bucket = index.get(value);
      if (!bucket) {
        bucket = new Set();
        index.set(value, bucket);
      }
      bucket.add(id);
    }
  }

  #removeFromIndexes(row) {
    const id = row[this.#key];
    for (const [field, index] of this.#index) {
      const bucket = index.get(row[field]);
      if (!bucket) continue;
      bucket.delete(id);
      if (bucket.size === 0) index.delete(row[field]);
    }
  }
}

export class ConstraintError extends Error {}

export class Store {
  constructor({ key = 'id', indexes = [], unique = [] } = {}) {
    this.key = key;
    this.records = [];
  }

  insert(record) {
    this.records.push(record);
    return record;
  }

  insertMany(records) {
    return records.map((r) => this.insert(r));
  }

  update(id, patch) {
    throw new Error('not implemented');
  }

  delete(id) {
    throw new Error('not implemented');
  }

  get(id) {
    return this.records.find((r) => r[this.key] === id);
  }

  get size() {
    return this.records.length;
  }

  findBy(field, value) {
    return this.records.filter((r) => r[field] === value);
  }

  query({ where = {}, orderBy = [] } = {}) {
    return [];
  }
}

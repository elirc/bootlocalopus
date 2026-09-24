export class Cart {
  items = [];

  add(item) {
    this.items.push(item);
    return this;
  }

  addAll(list) {
    list.forEach(this.add);   // BUG
    return this;
  }

  describe(index) {
    return this.items[index] ? 'item @ ' + this.items[index].price : 'empty';  // BUG when detached
  }

  get total() {
    return this.items.reduce((sum, i) => sum + i.price, 0);
  }
}

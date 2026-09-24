export class Cart {
  items = [];

  add(item) {
    this.items.push(item);
    return this;
  }

  addAll(list) {
    // Arrow keeps the lexical `this`; `list.forEach(this.add, this)` also works.
    list.forEach((item) => this.add(item));
    return this;
  }

  // A class field is bound to the instance, so it survives detaching.
  describe = (index) => {
    return this.items[index] ? 'item @ ' + this.items[index].price : 'empty';
  };

  get total() {
    return this.items.reduce((sum, i) => sum + i.price, 0);
  }
}

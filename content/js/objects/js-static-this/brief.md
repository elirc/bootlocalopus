The base class works in every test, because every test uses the base class.
Then someone subclasses it:

```js
class Model {
  static fromJSON(text) { return new Model(JSON.parse(text)); }
  clone() { return new Model({ ...this }); }
}
class User extends Model {}

User.fromJSON('{"id":1}') instanceof User; // false
```

Hard-coding the class name inside the class throws the subclass away. Inside
a **static** method, `this` is the class it was called on (`User`, not
`Model`), so `new this(...)` builds the right thing. Inside an **instance**
method, `this.constructor` is the concrete class. And `new.target` in a
constructor is the class `new` was called with — which is how a base class
refuses to be instantiated directly.

## Task

Export a class `Model` that subclasses configure with a `static fields`
array (for example `static fields = ['id', 'email']`):

- `static fields` — `[]` on `Model` itself.
- `constructor(attrs = {})` — throws a `TypeError` if called as
  `new Model(...)` directly. Otherwise sets **one own property per name in
  the concrete class's `fields`**, taking the value from `attrs` or `null`
  when it is missing (or `undefined`). Keys of `attrs` that are not in
  `fields` are ignored.
- `static fromJSON(text)` — parses the JSON and returns an instance of the
  class it was called on.
- `static many(rows)` — an array of instances of the class it was called on.
- `toJSON()` — a plain object with exactly the concrete class's `fields`.
- `clone(changes = {})` — a new instance of the **same class** with the
  current fields plus `changes` (still filtered by `fields`). The original is
  not modified.
- `equals(other)` — `true` when `other` is an instance of the very same class
  (a `User` never equals an `Admin`, even one with the same fields) and every
  field is equal by `Object.is`.
- `get [Symbol.toStringTag]()` — the concrete class's name, so
  `String(user)` is `[object User]`.

Subclasses may add fields: `class Admin extends User { static fields =
[...User.fields, 'level'] }` must work everywhere a `User` does.
